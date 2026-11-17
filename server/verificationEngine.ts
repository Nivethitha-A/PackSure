import {
  DetectionItem,
  VerificationResult,
  ComponentVerificationItem,
  InspectionStatus,
  ImageQualityMetrics
} from './types.ts';

/**
 * PackSure AI Intelligent Verification Engine
 * Pure deterministic rule engine for industrial order-aware packing verification.
 */
export function verifyPackingOrder(
  expectedComponents: Record<string, number>,
  detectedCounts: Record<string, number>,
  detections: DetectionItem[],
  confidenceThreshold: number = 0.50,
  imageQuality?: ImageQualityMetrics
): VerificationResult {
  const componentResults: ComponentVerificationItem[] = [];
  const missingComponents: Record<string, number> = {};
  const extraComponents: Record<string, number> = {};
  const uncertaintyFlags: string[] = [];
  const correctiveActions: string[] = [];

  // Group detections by class
  const detectionsByClass: Record<string, DetectionItem[]> = {};
  for (const det of detections) {
    if (!detectionsByClass[det.class_name]) {
      detectionsByClass[det.class_name] = [];
    }
    detectionsByClass[det.class_name].push(det);
  }

  // All relevant classes to inspect (union of expected and detected)
  const allClassNames = Array.from(
    new Set([...Object.keys(expectedComponents), ...Object.keys(detectedCounts)])
  );

  let hasMismatch = false;
  let hasLowConfidence = false;

  for (const cls of allClassNames) {
    const expected = expectedComponents[cls] || 0;
    const detected = detectedCounts[cls] || 0;
    const classDets = detectionsByClass[cls] || [];

    const confidences = classDets.map(d => d.confidence);
    const minConf = confidences.length > 0 ? Math.min(...confidences) : 0;
    const avgConf =
      confidences.length > 0
        ? Number((confidences.reduce((a, b) => a + b, 0) / confidences.length).toFixed(4))
        : 0;

    // Check if any detection of this component fell below confidence threshold
    const lowConfItems = classDets.filter(d => d.confidence < confidenceThreshold);
    const isUncertain = lowConfItems.length > 0;

    if (isUncertain) {
      hasLowConfidence = true;
      uncertaintyFlags.push(
        `${lowConfItems.length} ${cls} detection(s) have confidence below required threshold (${(
          confidenceThreshold * 100
        ).toFixed(0)}%). Lowest confidence: ${(minConf * 100).toFixed(1)}%.`
      );
      correctiveActions.push(
        `Low confidence for ${cls}: Re-orient component to avoid glare/shadows and re-inspect.`
      );
    }

    const delta = detected - expected;
    let status: 'MATCH' | 'MISSING' | 'EXTRA' | 'UNCERTAIN' = 'MATCH';

    if (isUncertain) {
      status = 'UNCERTAIN';
    } else if (delta < 0) {
      status = 'MISSING';
      const missingQty = Math.abs(delta);
      missingComponents[cls] = missingQty;
      hasMismatch = true;
      correctiveActions.push(
        `${missingQty} ${cls}${missingQty > 1 ? 's are' : ' is'} missing from the package. Add ${missingQty} ${cls}${missingQty > 1 ? 's' : ''} to the package and run reinspection.`
      );
    } else if (delta > 0) {
      status = 'EXTRA';
      const extraQty = delta;
      extraComponents[cls] = extraQty;
      hasMismatch = true;
      correctiveActions.push(
        `${extraQty} extra ${cls}${extraQty > 1 ? 's' : ''} detected in the package. Remove ${extraQty} extra ${cls}${extraQty > 1 ? 's' : ''} and re-verify.`
      );
    }

    componentResults.push({
      component_name: cls,
      expected,
      detected,
      status,
      delta,
      min_confidence: minConf,
      avg_confidence: avgConf,
      is_uncertain: isUncertain
    });
  }

  // Pre-flight image quality checks impact
  if (imageQuality && !imageQuality.quality_passed) {
    for (const warn of imageQuality.warnings) {
      uncertaintyFlags.push(`Image quality issue: ${warn}`);
    }
  }

  // Empty package check
  const totalDetected = Object.values(detectedCounts).reduce((a, b) => a + b, 0);
  const totalExpected = Object.values(expectedComponents).reduce((a, b) => a + b, 0);
  if (totalDetected === 0 && totalExpected > 0) {
    uncertaintyFlags.push('Zero mechanical components were detected by YOLO11 in the image.');
    correctiveActions.unshift(
      'No components detected. Verify that the camera is centered directly over the packing compartment and parts are fully visible.'
    );
  }

  // Decision Logic:
  // PASS: Exact match for all expected components, no extra components, and all confidence meets threshold.
  // NEEDS REVIEW: Uncertain confidence, severe image quality warning, or total lack of detection.
  // FAIL: Confirmed count mismatch (missing or extra).
  let overallStatus: InspectionStatus = 'PASS';
  let canApprove = false;
  let approvalBlockReason: string | undefined;

  if (hasLowConfidence || (imageQuality && !imageQuality.quality_passed && totalDetected === 0)) {
    overallStatus = 'NEEDS_REVIEW';
    canApprove = false;
    approvalBlockReason =
      'Approval blocked: AI model confidence or image quality is below industrial threshold. Manual review or re-capture required.';
  } else if (hasMismatch || Object.keys(missingComponents).length > 0 || Object.keys(extraComponents).length > 0) {
    overallStatus = 'FAIL';
    canApprove = false;
    approvalBlockReason =
      'Approval blocked: Component count mismatch detected. Package cannot be dispatched until discrepancies are resolved.';
  } else {
    overallStatus = 'PASS';
    canApprove = true;
    correctiveActions.push('All components and quantities verified successfully. Package is cleared for dispatch sign-off.');
  }

  return {
    overall_status: overallStatus,
    component_results: componentResults,
    missing_components: missingComponents,
    extra_components: extraComponents,
    uncertainty_flags: uncertaintyFlags,
    corrective_actions: correctiveActions,
    can_approve: canApprove,
    approval_block_reason: approvalBlockReason,
    confidence_threshold_applied: confidenceThreshold
  };
}
