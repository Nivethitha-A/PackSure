import { jsPDF } from 'jspdf';
import { Inspection } from '../types';

export function generateInspectionPdf(inspection: Inspection) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let currentY = 18;

  // Header Bar
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Title & Brand
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text('PACKSURE AI', 15, 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text('INDUSTRIAL PACKING VERIFICATION CERTIFICATE', 15, 21);

  // Status Badge in Header
  const status = inspection.inspection_status;
  let statusBg = [22, 163, 74]; // green for PASS
  if (status === 'FAIL') statusBg = [220, 38, 38]; // red
  if (status === 'NEEDS_REVIEW') statusBg = [217, 119, 6]; // amber

  doc.setFillColor(statusBg[0], statusBg[1], statusBg[2]);
  doc.roundedRect(pageWidth - 50, 8, 35, 12, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(status.replace('_', ' '), pageWidth - 32.5, 15.5, { align: 'center' });

  currentY = 38;

  // Metadata Grid
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text('INSPECTION ID', 15, currentY);
  doc.text('ORDER ID', 75, currentY);
  doc.text('DATE / TIMESTAMP', 140, currentY);

  currentY += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(inspection.inspection_id, 15, currentY);
  doc.text(inspection.order_id, 75, currentY);
  doc.text(new Date(inspection.created_at).toLocaleString(), 140, currentY);

  currentY += 9;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('PRODUCT NAME', 15, currentY);
  doc.text('INSPECTOR', 140, currentY);

  currentY += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(inspection.product_name, 15, currentY);
  doc.text(inspection.inspected_by_name || 'Quality Inspector', 140, currentY);

  currentY += 10;
  // Divider line
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.line(15, currentY, pageWidth - 15, currentY);

  currentY += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('COMPONENT-WISE VERIFICATION AUDIT', 15, currentY);

  currentY += 6;

  // Table Header
  doc.setFillColor(241, 245, 249); // slate-100
  doc.rect(15, currentY, pageWidth - 30, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('COMPONENT', 18, currentY + 5.5);
  doc.text('EXPECTED', 75, currentY + 5.5, { align: 'right' });
  doc.text('DETECTED', 105, currentY + 5.5, { align: 'right' });
  doc.text('VARIANCE (DELTA)', 140, currentY + 5.5, { align: 'right' });
  doc.text('STATUS', pageWidth - 20, currentY + 5.5, { align: 'right' });

  currentY += 8;

  // Rows
  const results = inspection.verification_result?.component_results || [];
  for (const item of results) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(item.component_name, 18, currentY + 5.5);
    doc.text(String(item.expected), 75, currentY + 5.5, { align: 'right' });
    doc.text(String(item.detected), 105, currentY + 5.5, { align: 'right' });

    const deltaStr = item.delta > 0 ? `+${item.delta}` : String(item.delta);
    doc.text(deltaStr, 140, currentY + 5.5, { align: 'right' });

    // Status text color
    if (item.status === 'MATCH') {
      doc.setTextColor(22, 163, 74);
    } else if (item.status === 'MISSING') {
      doc.setTextColor(220, 38, 38);
    } else if (item.status === 'EXTRA') {
      doc.setTextColor(202, 138, 4);
    } else {
      doc.setTextColor(217, 119, 6);
    }
    doc.setFont('helvetica', 'bold');
    doc.text(item.status, pageWidth - 20, currentY + 5.5, { align: 'right' });

    doc.setDrawColor(241, 245, 249);
    doc.line(15, currentY + 8, pageWidth - 15, currentY + 8);
    currentY += 8;
  }

  currentY += 6;

  // Summary & Correction Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(15, currentY, pageWidth - 30, 38, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('INTELLIGENT CORRECTIVE GUIDANCE & DISCREPANCY ANALYSIS', 20, currentY + 6);

  const actions = inspection.verification_result?.corrective_actions || [];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);

  let actionY = currentY + 12;
  if (actions.length === 0) {
    doc.text('• No discrepancies detected. Package is 100% compliant with expected bill of materials.', 20, actionY);
  } else {
    for (const act of actions.slice(0, 3)) {
      doc.text(`• ${act}`, 20, actionY);
      actionY += 5;
    }
  }

  // Model & AI Information Note
  currentY += 44;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('AI INFERENCE METRICS', 15, currentY);
  doc.text(`Model: Custom YOLO11 (best.pt) | Confidence Filter: ${(inspection.verification_result?.confidence_threshold_applied * 100 || 50).toFixed(0)}%`, 15, currentY + 4.5);
  doc.text(`Total Detections: ${inspection.detections?.length || 0} objects identified`, 15, currentY + 8.5);

  // Digital Signoff Block
  currentY += 18;
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(15, currentY, pageWidth - 30, 28, 2, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('DISPATCH AUTHORIZATION & QUALITY SIGN-OFF', 20, currentY + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);

  if (inspection.digital_signoff) {
    doc.text(`Approved By: ${inspection.digital_signoff.approved_by}`, 20, currentY + 13);
    doc.text(`Approval Date: ${new Date(inspection.digital_signoff.approved_at).toLocaleString()}`, 20, currentY + 18);
    doc.text(`Dispatch Authorization Hash: ${inspection.digital_signoff.dispatch_authorization_code}`, 20, currentY + 23);
  } else if (inspection.inspection_status === 'PASS') {
    doc.text('Status: Verification PASSED. Pending authorized digital dispatch sign-off in system.', 20, currentY + 14);
  } else {
    doc.setTextColor(220, 38, 38);
    doc.text('CRITICAL: DISPATCH BLOCKED. Package failed verification or requires supervisor review.', 20, currentY + 14);
  }

  // Footer
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text('PackSure AI Digital Traceability System • Generated for Industrial Quality Control Compliance', pageWidth / 2, 285, { align: 'center' });

  // Save PDF
  doc.save(`PackSure_Certificate_${inspection.inspection_id}.pdf`);
}
