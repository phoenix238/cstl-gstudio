import React, { useState, useEffect, Suspense, lazy } from 'react';
import { collection, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore';
import {
  auth,
  db,
  initAuth,
  googleSignIn,
  googleLogout,
  setAccessToken,
  isGoogleTokenExpired,
  refreshGoogleAccessToken,
} from './firebase';
import { Client, Appointment } from './types';
import { User as FirebaseUser } from 'firebase/auth';
import { ShieldCheck, Activity, Calendar, Users, LogOut, Sparkles, MessageSquare, AlertCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const ClientList = lazy(() => import('./components/ClientList'));
const AppointmentScheduler = lazy(() => import('./components/AppointmentScheduler'));
const ClientDetail = lazy(() => import('./components/ClientDetail'));
const BookingAssistant = lazy(() => import('./components/BookingAssistant'));

const SEED_SAMPLE_CLIENTS =
  import.meta.env.DEV && import.meta.env.VITE_SEED_SAMPLE_CLIENTS === 'true';

function TabLoading() {
  return (
    <div className="h-full flex items-center justify-center text-natural-muted text-sm gap-2">
      <Loader2 className="w-4 h-4 animate-spin" />
      Loading...
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [needsGoogleReconnect, setNeedsGoogleReconnect] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isRefreshingGoogle, setIsRefreshingGoogle] = useState(false);
  const [activeTab, setActiveTab] = useState<'clients' | 'schedule' | 'detail' | 'booking'>('clients');

  const [clients, setClients] = useState<Client[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, accessToken) => {
        setUser(currentUser);
        setToken(accessToken);
        setAccessToken(accessToken);
        setNeedsAuth(false);
        setNeedsGoogleReconnect(isGoogleTokenExpired());
      },
      () => {
        setNeedsAuth(true);
        setNeedsGoogleReconnect(false);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || needsAuth) return;
    const interval = window.setInterval(() => {
      if (isGoogleTokenExpired()) {
        setNeedsGoogleReconnect(true);
      }
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [user, needsAuth]);

  const fetchClinicalData = async () => {
    if (!auth.currentUser) return;
    try {
      const clientsRef = collection(db, 'users', auth.currentUser.uid, 'clients');
      const clientsSnap = await getDocs(clientsRef);
      let loadedClients: Client[] = [];
      clientsSnap.forEach((docSnap) => {
        loadedClients.push({ id: docSnap.id, ...docSnap.data() } as Client);
      });

      const appRef = collection(db, 'users', auth.currentUser.uid, 'appointments');
      const appSnap = await getDocs(appRef);
      let loadedApps: Appointment[] = [];
      appSnap.forEach((docSnap) => {
        loadedApps.push({ id: docSnap.id, ...docSnap.data() } as Appointment);
      });

      if (loadedClients.length === 0 && SEED_SAMPLE_CLIENTS) {
        const initialClients: Client[] = [
          {
            id: 'sample-1',
            name: 'Sarah Jenkins',
            email: 'sarah.j@example.com',
            phone: '(415) 555-1201',
            docId: '',
            createdAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
          },
          {
            id: 'sample-2',
            name: 'Robert Vance',
            email: 'robert@vancerefrig.com',
            phone: '(510) 555-4920',
            docId: '',
            createdAt: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(),
          },
        ];

        for (const c of initialClients) {
          const docRef = doc(db, 'users', auth.currentUser!.uid, 'clients', c.id);
          await setDoc(docRef, c);
        }
        loadedClients = initialClients;
      }

      setClients(loadedClients);
      setAppointments(loadedApps);
    } catch (err) {
      console.error('Error fetching Firestore clinical data:', err);
    }
  };

  useEffect(() => {
    if (user) {
      fetchClinicalData();
    }
  }, [user]);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setToken(result.accessToken);
        setNeedsAuth(false);
        setNeedsGoogleReconnect(false);
      }
    } catch (err) {
      console.error('Login failed:', err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRefreshGoogle = async () => {
    setIsRefreshingGoogle(true);
    try {
      const refreshed = await refreshGoogleAccessToken();
      setToken(refreshed);
      setNeedsGoogleReconnect(false);
    } catch (err) {
      console.error('Google token refresh failed:', err);
    } finally {
      setIsRefreshingGoogle(false);
    }
  };

  const handleLogout = async () => {
    await googleLogout();
    setUser(null);
    setToken(null);
    setNeedsAuth(true);
    setNeedsGoogleReconnect(false);
    setSelectedClient(null);
    setClients([]);
    setAppointments([]);
  };

  const handleAddClient = async (newClient: Client, redirectAfterAdd = true) => {
    if (!auth.currentUser) return;

    setClients((prev) => [newClient, ...prev]);
    if (redirectAfterAdd) {
      setSelectedClient(newClient);
      setActiveTab('detail');
    }

    try {
      const clientDocRef = doc(db, 'users', auth.currentUser.uid, 'clients', newClient.id);
      await setDoc(clientDocRef, newClient);
    } catch (err) {
      console.error('Failed to write new client to firestore:', err);
      setClients((prev) => prev.filter((c) => c.id !== newClient.id));
    }
  };

  const handleAddAppointment = async (newApp: Appointment) => {
    if (!auth.currentUser) return;
    try {
      const appDocRef = doc(db, 'users', auth.currentUser.uid, 'appointments', newApp.id);
      await setDoc(appDocRef, newApp);
      setAppointments((prev) => [newApp, ...prev]);
    } catch (err) {
      console.error('Failed to write appointment to firestore:', err);
    }
  };

  const handleCompleteAppointment = async (appId: string) => {
    if (!auth.currentUser) return;
    try {
      const docRef = doc(db, 'users', auth.currentUser.uid, 'appointments', appId);
      await updateDoc(docRef, { status: 'completed' });
      setAppointments((prev) =>
        prev.map((app) => (app.id === appId ? { ...app, status: 'completed' } : app))
      );
    } catch (err) {
      console.error('Failed to update appointment status:', err);
    }
  };

  const handleCancelAppointment = async (appId: string) => {
    if (!auth.currentUser) return;
    try {
      const docRef = doc(db, 'users', auth.currentUser.uid, 'appointments', appId);
      await updateDoc(docRef, { status: 'cancelled' });
      setAppointments((prev) =>
        prev.map((app) => (app.id === appId ? { ...app, status: 'cancelled' } : app))
      );
    } catch (err) {
      console.error('Failed to cancel appointment:', err);
    }
  };

  return (
    <div className="min-h-screen bg-natural-bg flex flex-col antialiased text-natural-text selection:bg-natural-sage/20 selection:text-natural-sage" id="main-applet-container">
      <AnimatePresence mode="wait">
        {needsAuth ? (
          <motion.div
            key="login-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col justify-center items-center px-6 py-12 bg-gradient-to-b from-natural-bg to-natural-sidebar/50"
          >
            <div className="w-full max-w-md bg-white border border-natural-border p-8 rounded-[32px] shadow-sm text-center space-y-6">
              <div className="flex flex-col items-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-natural-sage to-natural-sage-light text-white flex items-center justify-center shadow-lg shadow-natural-sage/10">
                  <ShieldCheck className="w-8 h-8" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-natural-text font-serif italic">
                  Therapy Control Center
                </h1>
                <p className="text-xs text-natural-muted font-sans max-w-xs mx-auto">
                  A unified workstation for practitioners. Synchronise client histories, dictate session summaries, and coordinate schedules with Google Workspace.
                </p>
              </div>

              <div className="bg-natural-bg border border-natural-border/60 rounded-2xl p-4 text-left text-[11px] text-natural-text font-sans space-y-1">
                <p className="font-semibold text-natural-sage flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  How your data is handled
                </p>
                <p className="leading-relaxed text-natural-muted">
                  Audio dictation is transcribed server-side via Gemini. Client metadata is stored in your Firebase account. Session notes and calendar events sync to your personal Google Drive and Google Calendar. You are responsible for ensuring this setup meets your professional and regulatory obligations.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <button
                  onClick={handleLogin}
                  disabled={isLoggingIn}
                  className="w-full py-3 px-4 bg-white border-2 border-natural-sage hover:bg-natural-sage hover:text-white text-natural-sage font-semibold font-sans text-xs tracking-tight rounded-2xl cursor-pointer shadow-sm flex items-center justify-center gap-3 transition-all focus:outline-none disabled:opacity-50"
                >
                  <span>{isLoggingIn ? 'Connecting...' : 'Sign in with Google Workspace'}</span>
                </button>
                <p className="text-[10px] text-natural-muted font-sans">
                  Grants access to Calendar, Drive, and Google Docs for your signed-in account only.
                </p>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col md:flex-row max-w-7xl w-full mx-auto bg-white md:shadow-lg md:my-4 md:rounded-[32px] overflow-hidden h-[calc(100vh-1rem)] md:h-[85vh] border border-natural-border"
          >
            <div className="hidden md:flex flex-col w-64 bg-natural-sidebar text-natural-text p-6 border-r border-natural-border shrink-0">
              <div className="flex items-center gap-3 mb-10">
                <div className="w-10 h-10 bg-natural-sage rounded-xl text-white flex items-center justify-center font-bold text-lg shadow-sm">
                  𝜓
                </div>
                <div>
                  <h1 className="font-serif italic text-xl font-bold tracking-tight text-natural-text">TheraCenter</h1>
                  <p className="text-[10px] text-natural-muted font-medium uppercase tracking-wider">Practice Dashboard</p>
                </div>
              </div>

              <nav className="flex-1 space-y-1">
                {([
                  ['clients', Users, 'Clients Registry'],
                  ['schedule', Calendar, 'Appointments'],
                  ['booking', MessageSquare, 'Booking Assistant'],
                ] as const).map(([tab, Icon, label]) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 cursor-pointer font-medium transition-colors ${
                      activeTab === tab ? 'bg-white/60 text-natural-sage shadow-xs' : 'text-natural-muted hover:text-natural-sage hover:bg-white/30'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {label}
                  </button>
                ))}
                {selectedClient && (
                  <button
                    onClick={() => setActiveTab('detail')}
                    className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 cursor-pointer font-medium transition-colors ${
                      activeTab === 'detail' ? 'bg-white/60 text-natural-sage shadow-xs' : 'text-natural-muted hover:text-natural-sage hover:bg-white/30'
                    }`}
                  >
                    <Activity className="w-4 h-4 shrink-0" />
                    Notes: {selectedClient.name.split(' ')[0]}
                  </button>
                )}
              </nav>

              <div className="p-4 bg-white/30 rounded-2xl border border-white/50 mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-2 h-2 rounded-full ${needsGoogleReconnect ? 'bg-amber-500' : 'bg-emerald-600 animate-pulse'}`} />
                  <span className="text-[10px] uppercase tracking-wider font-bold text-natural-muted">
                    {needsGoogleReconnect ? 'Google Reconnect Needed' : 'Google Sync Active'}
                  </span>
                </div>
                <p className="text-[11px] text-natural-muted/80 leading-tight">
                  {needsGoogleReconnect
                    ? 'Workspace access expired. Reconnect to sync calendars and docs.'
                    : 'Signed-in Google session'}
                </p>
                {needsGoogleReconnect && (
                  <button
                    onClick={handleRefreshGoogle}
                    disabled={isRefreshingGoogle}
                    className="mt-2 w-full text-[10px] font-bold py-1.5 rounded-lg bg-natural-sage text-white disabled:opacity-50"
                  >
                    {isRefreshingGoogle ? 'Reconnecting...' : 'Reconnect Google'}
                  </button>
                )}
              </div>

              <div className="border-t border-natural-border/60 pt-4 mt-auto flex items-center justify-between text-xs text-natural-text">
                <div className="truncate pr-2">
                  <p className="font-bold text-natural-text truncate font-serif italic">{user?.displayName || 'Practitioner'}</p>
                  <p className="text-[10px] text-natural-muted truncate">{user?.email}</p>
                </div>
                <button onClick={handleLogout} className="p-2 rounded-xl bg-white/40 hover:bg-white/80 text-natural-muted hover:text-natural-sage transition-colors cursor-pointer" title="Sign Out">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="md:hidden flex items-center justify-between px-4 py-3.5 border-b border-natural-border bg-natural-sidebar shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-natural-sage text-white flex items-center justify-center font-bold text-xs shadow-sm">𝜓</div>
                <span className="font-serif italic font-bold text-base text-natural-text tracking-tight">TheraCenter</span>
              </div>
              <button onClick={handleLogout} className="p-1.5 rounded-lg text-natural-muted hover:text-natural-text cursor-pointer">
                <LogOut className="w-4 h-4" />
              </button>
            </div>

            {needsGoogleReconnect && (
              <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between gap-2 text-xs text-amber-950">
                <span className="flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  Google Workspace access has expired.
                </span>
                <button onClick={handleRefreshGoogle} disabled={isRefreshingGoogle} className="font-bold underline disabled:opacity-50">
                  {isRefreshingGoogle ? 'Reconnecting...' : 'Reconnect'}
                </button>
              </div>
            )}

            <div className="flex-1 bg-white relative">
              <AnimatePresence mode="wait">
                {activeTab === 'clients' && (
                  <motion.div key="tab-clients" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="h-full">
                    <Suspense fallback={<TabLoading />}>
                      <ClientList
                        clients={clients}
                        accessToken={token!}
                        onSelectClient={(c) => { setSelectedClient(c); setActiveTab('detail'); }}
                        onAddClient={handleAddClient}
                      />
                    </Suspense>
                  </motion.div>
                )}
                {activeTab === 'schedule' && (
                  <motion.div key="tab-schedule" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="h-full">
                    <Suspense fallback={<TabLoading />}>
                      <AppointmentScheduler
                        appointments={appointments}
                        clients={clients}
                        accessToken={token!}
                        onAddAppointment={handleAddAppointment}
                        onCancelAppointment={handleCancelAppointment}
                        onCompleteAppointment={handleCompleteAppointment}
                      />
                    </Suspense>
                  </motion.div>
                )}
                {activeTab === 'booking' && (
                  <motion.div key="tab-booking" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="h-full">
                    <Suspense fallback={<TabLoading />}>
                      <BookingAssistant
                        clients={clients}
                        appointments={appointments}
                        accessToken={token!}
                        onAddAppointment={handleAddAppointment}
                        onAddClient={handleAddClient}
                      />
                    </Suspense>
                  </motion.div>
                )}
                {activeTab === 'detail' && selectedClient && (
                  <motion.div key="tab-detail" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="h-full">
                    <Suspense fallback={<TabLoading />}>
                      <ClientDetail
                        client={selectedClient}
                        appointments={appointments}
                        accessToken={token!}
                        onBack={() => setActiveTab('clients')}
                        onUpdateClientDoc={(clientId, docId) => {
                          setClients((prev) => prev.map((c) => (c.id === clientId ? { ...c, docId } : c)));
                          if (selectedClient?.id === clientId) {
                            setSelectedClient({ ...selectedClient, docId });
                          }
                        }}
                      />
                    </Suspense>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="md:hidden border-t border-natural-border flex items-center justify-around py-3 bg-natural-sidebar shrink-0 absolute bottom-0 left-0 right-0 z-30 font-sans">
              {([
                ['clients', Users, 'Clients'],
                ['schedule', Calendar, 'Schedule'],
                ['booking', MessageSquare, 'Booking'],
              ] as const).map(([tab, Icon, label]) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex flex-col items-center gap-0.5 text-[10px] font-sans font-semibold cursor-pointer ${
                    activeTab === tab ? 'text-natural-sage' : 'text-natural-muted'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{label}</span>
                </button>
              ))}
              {selectedClient ? (
                <button
                  onClick={() => setActiveTab('detail')}
                  className={`flex flex-col items-center gap-0.5 text-[10px] font-sans font-semibold cursor-pointer ${
                    activeTab === 'detail' ? 'text-natural-sage' : 'text-natural-muted'
                  }`}
                >
                  <Activity className="w-5 h-5" />
                  <span className="max-w-[70px] truncate">{selectedClient.name.split(' ')[0]}'s Notes</span>
                </button>
              ) : (
                <div className="flex flex-col items-center gap-0.5 text-[10px] font-sans font-semibold text-natural-muted/40 select-none">
                  <Activity className="w-5 h-5" />
                  <span>No Selected</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}