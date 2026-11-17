import React, { useState, useEffect, useMemo, useRef } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';
import {
  syncUserProfile,
  ensureAdminConfigInitialized,
  subscribeOrders,
  subscribeInspections,
  subscribeComponents,
  subscribeSettings,
  subscribeUsers,
  createOrderInFirestore,
  updateOrderInFirestore,
  updateSystemSettingsInFirestore,
  updateUserRoleInFirestore,
  seedDemoDataInFirestore,
  computeAnalytics,
  DEFAULT_SYSTEM_SETTINGS,
  DEFAULT_COMPONENTS
} from './services/firestoreService';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { QrScannerModal } from './components/QrScannerModal';
import { DashboardView } from './views/DashboardView';
import { OrdersView } from './views/OrdersView';
import { InspectionView } from './views/InspectionView';
import { HistoryView } from './views/HistoryView';
import { AnalyticsView } from './views/AnalyticsView';
import { SettingsView } from './views/SettingsView';
import { LoginView } from './views/LoginView';
import {
  User,
  UserRole,
  Order,
  Inspection,
  ModelInfoResponse,
  SystemSettings,
  ComponentDefinition
} from './types';
import { RefreshCw } from 'lucide-react';

export default function App() {
  const [currentTab, setCurrentTab] = useState<string>('dashboard');

  // Firebase Auth readiness & current authenticated profile
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Firestore real-time state
  const [orders, setOrders] = useState<Order[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [components, setComponents] = useState<ComponentDefinition[]>(DEFAULT_COMPONENTS);
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SYSTEM_SETTINGS);
  const [users, setUsers] = useState<User[]>([]);
  const [modelInfo, setModelInfo] = useState<ModelInfoResponse | null>(null);

  // Active order in inspection stage
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);

  const autoSeededForUidRef = useRef<string | null>(null);

  // Compute live quality analytics directly from persistent Firestore state
  const analytics = useMemo(
    () => computeAnalytics(orders, inspections),
    [orders, inspections]
  );

  // Fetch ONNX Runtime YOLO11 model status from backend
  const fetchModelInfo = async () => {
    try {
      const res = await fetch('/api/model/info');
      if (res.ok) {
        setModelInfo(await res.json());
      }
    } catch (err) {
      console.warn('[PackSure AI] Model status check warning:', err);
    }
  };

  useEffect(() => {
    fetchModelInfo();
    const interval = setInterval(fetchModelInfo, 10000);
    return () => clearInterval(interval);
  }, []);

  // Listen to Firebase Authentication state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setCurrentUser(null);
        setOrders([]);
        setInspections([]);
        setUsers([]);
        setActiveOrder(null);
        autoSeededForUidRef.current = null;
        setAuthReady(true);
        return;
      }

      try {
        setAuthError(null);
        const profile = await syncUserProfile(firebaseUser);
        await ensureAdminConfigInitialized(profile);
        setCurrentUser(profile);
      } catch (err: any) {
        console.error('[PackSure AI] User profile sync failed:', err);
        setAuthError('Failed to initialize station user profile in Firestore.');
        setCurrentUser(null);
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsubscribe();
  }, []);

  // Attach Firestore real-time listeners ONLY when auth is ready and user is authenticated
  useEffect(() => {
    if (!authReady || !currentUser) return;

    const unsubOrders = subscribeOrders(currentUser, async (loadedOrders) => {
      setOrders(loadedOrders);
      // Seed demonstration records once if workspace is completely empty for this user
      if (loadedOrders.length === 0 && autoSeededForUidRef.current !== currentUser.id) {
        autoSeededForUidRef.current = currentUser.id;
        try {
          await seedDemoDataInFirestore(currentUser, [], []);
        } catch (err) {
          console.warn('[PackSure AI] Initial demo seed skipped:', err);
        }
      }
    });

    const unsubInspections = subscribeInspections(currentUser, setInspections);
    const unsubComponents = subscribeComponents(setComponents);
    const unsubSettings = subscribeSettings(setSettings);
    const unsubUsers = subscribeUsers(currentUser, setUsers);

    return () => {
      unsubOrders();
      unsubInspections();
      unsubComponents();
      unsubSettings();
      unsubUsers();
    };
  }, [authReady, currentUser?.id, currentUser?.role]);

  // Handlers
  const handleLogout = async () => {
    await signOut(auth);
    setCurrentUser(null);
    setCurrentTab('dashboard');
  };

  const handleCreateOrder = async (orderData: Partial<Order>) => {
    if (!currentUser) throw new Error('Authentication required');
    await createOrderInFirestore(orderData, currentUser, orders);
  };

  const handleUpdateOrder = async (id: string, updates: Partial<Order>) => {
    await updateOrderInFirestore(id, updates);
  };

  const handleUpdateSettings = async (newSettings: Partial<SystemSettings>) => {
    if (!currentUser) throw new Error('Authentication required');
    await updateSystemSettingsInFirestore(newSettings, settings, currentUser);
  };

  const handleResetDemo = async () => {
    if (!currentUser) throw new Error('Authentication required');
    await seedDemoDataInFirestore(currentUser, orders, inspections);
  };

  const handleUpdateUserRole = async (targetUser: User, newRole: UserRole) => {
    if (!currentUser) throw new Error('Authentication required');
    await updateUserRoleInFirestore(targetUser, newRole, currentUser);
  };

  const handleStartInspection = (order?: Order) => {
    if (order) {
      setActiveOrder(order);
    } else if (orders.length > 0 && !activeOrder) {
      setActiveOrder(orders[0]);
    }
    setCurrentTab('inspect');
  };

  const handleInspectionComplete = (inspection: Inspection) => {
    setInspections((prev) => {
      const filtered = prev.filter((i) => i.id !== inspection.id);
      return [inspection, ...filtered];
    });
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-300 text-xs gap-2">
        <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
        <span>Initializing PackSure AI Station Security...</span>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginView authError={authError} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Bar Contract (3 zones) */}
      <Navbar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        currentUser={currentUser}
        onLogout={handleLogout}
        modelInfo={modelInfo}
        onOpenSettings={() => setCurrentTab('settings')}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Dark Navy Sidebar */}
        <Sidebar
          currentTab={currentTab}
          onTabChange={setCurrentTab}
          orders={orders}
          modelInfo={modelInfo}
          onStartInspection={handleStartInspection}
        />

        {/* Main Content Workspace */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {currentTab === 'dashboard' && (
              <DashboardView
                orders={orders}
                inspections={inspections}
                analytics={analytics}
                modelInfo={modelInfo}
                onNavigate={setCurrentTab}
                onStartInspection={handleStartInspection}
                onOpenQrScanner={() => setIsQrScannerOpen(true)}
                onViewInspection={(insp) => {
                  const targetOrd = orders.find((o) => o.order_id === insp.order_id);
                  if (targetOrd) setActiveOrder(targetOrd);
                  setCurrentTab('inspect');
                }}
              />
            )}

            {currentTab === 'orders' && (
              <OrdersView
                orders={orders}
                components={components}
                onCreateOrder={handleCreateOrder}
                onUpdateOrder={handleUpdateOrder}
                onInspectOrder={handleStartInspection}
              />
            )}

            {currentTab === 'inspect' && (
              <InspectionView
                orders={orders}
                selectedOrder={activeOrder}
                onSelectOrder={setActiveOrder}
                onNavigate={setCurrentTab}
                modelInfo={modelInfo}
                settings={settings}
                currentUser={currentUser}
                onInspectionComplete={handleInspectionComplete}
              />
            )}

            {currentTab === 'history' && (
              <HistoryView
                inspections={inspections}
                onViewInspection={(insp) => {
                  const ord = orders.find((o) => o.order_id === insp.order_id);
                  if (ord) setActiveOrder(ord);
                  setCurrentTab('inspect');
                }}
                onReinspect={(insp) => {
                  const ord = orders.find((o) => o.order_id === insp.order_id);
                  if (ord) setActiveOrder(ord);
                  setCurrentTab('inspect');
                }}
              />
            )}

            {currentTab === 'analytics' && <AnalyticsView analytics={analytics} />}

            {currentTab === 'settings' && (
              <SettingsView
                modelInfo={modelInfo}
                settings={settings}
                currentUser={currentUser}
                users={users.length > 0 ? users : [currentUser]}
                onUpdateSettings={handleUpdateSettings}
                onRefreshModel={fetchModelInfo}
                onResetDemo={handleResetDemo}
                onUpdateUserRole={handleUpdateUserRole}
              />
            )}
          </div>
        </main>
      </div>

      {/* QR & Barcode Camera Scanner Modal */}
      <QrScannerModal
        isOpen={isQrScannerOpen}
        onClose={() => setIsQrScannerOpen(false)}
        orders={orders}
        onSelectOrder={(ord) => {
          setActiveOrder(ord);
          setCurrentTab('inspect');
        }}
      />
    </div>
  );
}
