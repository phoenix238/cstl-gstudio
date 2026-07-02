import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, initAuth, googleSignIn, googleLogout, setAccessToken } from './firebase';
import { Client, Appointment } from './types';
import ClientList from './components/ClientList';
import AppointmentScheduler from './components/AppointmentScheduler';
import ClientDetail from './components/ClientDetail';
import BookingAssistant from './components/BookingAssistant';
import { User as FirebaseUser } from 'firebase/auth';
import { ShieldCheck, Activity, Calendar, Users, LogOut, ChevronRight, Sparkles, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [activeTab, setActiveTab] = useState<'clients' | 'schedule' | 'detail' | 'booking'>('clients');

  // Business state
  const [clients, setClients] = useState<Client[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Initialize auth
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, accessToken) => {
        setUser(currentUser);
        setToken(accessToken);
        setAccessToken(accessToken);
        setNeedsAuth(false);
      },
      () => {
        setNeedsAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  // Fetch from Firestore
  const fetchClinicalData = async () => {
    if (!auth.currentUser) return;
    setIsLoadingData(true);
    try {
      // 1. Fetch Clients
      const clientsRef = collection(db, 'users', auth.currentUser.uid, 'clients');
      const clientsSnap = await getDocs(clientsRef);
      let loadedClients: Client[] = [];
      clientsSnap.forEach((docSnap) => {
        loadedClients.push({ id: docSnap.id, ...docSnap.data() } as Client);
      });

      // 2. Fetch Appointments
      const appRef = collection(db, 'users', auth.currentUser.uid, 'appointments');
      const appSnap = await getDocs(appRef);
      let loadedApps: Appointment[] = [];
      appSnap.forEach((docSnap) => {
        loadedApps.push({ id: docSnap.id, ...docSnap.data() } as Appointment);
      });

      // Seeding database with beautiful starter clients if totally empty to make app immediately useful
      if (loadedClients.length === 0) {
        console.log('Seeding initial clinical sample client registries for active workspace...');
        const initialClients: Client[] = [
          {
            id: 'sample-1',
            name: 'Sarah Jenkins',
            email: 'sarah.j@example.com',
            phone: '(415) 555-1201',
            docId: '16w4q8Y8oYh5kbyXNq3t62e6nL_I1E4PclXWshG2_oDo', // Just a placeholder until they provision a real one
            createdAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
          },
          {
            id: 'sample-2',
            name: 'Robert Vance',
            email: 'robert@vancerefrig.com',
            phone: '(510) 555-4920',
            docId: '1zHhGbe-pT2_IqH7VfBqH2N8q3E2V7k3R9e6_pDo_4oE',
            createdAt: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(),
          }
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
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchClinicalData();
    }
  }, [user]);

  // Handle Login
  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setToken(result.accessToken);
        setNeedsAuth(false);
      }
    } catch (err) {
      console.error('Login failed:', err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    await googleLogout();
    setUser(null);
    setToken(null);
    setNeedsAuth(true);
    setSelectedClient(null);
    setClients([]);
    setAppointments([]);
  };

  // Onboard client
  const handleAddClient = async (newClient: Client, redirectAfterAdd = true) => {
    if (!auth.currentUser) return;
    
    // Optimistic UI updates - makes client show up instantly!
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
      // Rollback optimistic state if write fails
      setClients((prev) => prev.filter((c) => c.id !== newClient.id));
    }
  };

  // Schedule Appointment
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

  // Update appointment status to completed
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

  // Cancel Appointment
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
          /* CALMING LOGIN PAGE (Natural Tones) */
          <motion.div
            key="login-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col justify-center items-center px-6 py-12 bg-gradient-to-b from-natural-bg to-natural-sidebar/50"
          >
            <div className="w-full max-w-md bg-white border border-natural-border p-8 rounded-[32px] shadow-sm text-center space-y-6">
              {/* App Identity */}
              <div className="flex flex-col items-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-natural-sage to-natural-sage-light text-white flex items-center justify-center shadow-lg shadow-natural-sage/10">
                  <ShieldCheck className="w-8 h-8" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-natural-text font-serif italic">
                  Therapy Control Center
                </h1>
                <p className="text-xs text-natural-muted font-sans max-w-xs mx-auto">
                  A unified, secure workstation for mental health practitioners. Synchronize client histories, dictate clinical summaries, and coordinate schedules seamlessly.
                </p>
              </div>

              {/* Secure Credentials Info Panel */}
              <div className="bg-natural-bg border border-natural-border/60 rounded-2xl p-4 text-left text-[11px] text-natural-text font-sans space-y-1">
                <p className="font-semibold text-natural-sage flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  Google Workspace Security Sandbox
                </p>
                <p className="leading-relaxed text-natural-muted">
                  Your HIPAA & GDPR compliant audio recordings are transcribed server-side using secure private models. All calendar schedules and session summaries sync directly to your personal Google Drive (Docs) and Google Calendar.
                </p>
              </div>

              {/* Login Action */}
              <div className="space-y-3 pt-2">
                <button
                  onClick={handleLogin}
                  disabled={isLoggingIn}
                  className="w-full py-3 px-4 bg-white border-2 border-natural-sage hover:bg-natural-sage hover:text-white text-natural-sage font-semibold font-sans text-xs tracking-tight rounded-2xl cursor-pointer shadow-sm flex items-center justify-center gap-3 transition-all focus:outline-none disabled:opacity-50"
                >
                  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5 block shrink-0">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  </svg>
                  <span>
                    {isLoggingIn ? 'Connecting Securely...' : 'Sign in with Google Workspace'}
                  </span>
                </button>
                <p className="text-[10px] text-natural-muted font-sans">
                  By signing in, you grant secure file access to Calendar, Drive, and Google Docs.
                </p>
              </div>
            </div>
          </motion.div>
        ) : (
          /* WORKSPACE DASHBOARD */
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col md:flex-row max-w-7xl w-full mx-auto bg-white md:shadow-lg md:my-4 md:rounded-[32px] overflow-hidden h-[calc(100vh-1rem)] md:h-[85vh] border border-natural-border"
          >
            {/* Desktop Sidebar / App Brand */}
            <div className="hidden md:flex flex-col w-64 bg-natural-sidebar text-natural-text p-6 border-r border-natural-border shrink-0">
              <div className="flex items-center gap-3 mb-10">
                <div className="w-10 h-10 bg-natural-sage rounded-xl text-white flex items-center justify-center font-bold text-lg shadow-sm">
                  𝜓
                </div>
                <div>
                  <h1 className="font-serif italic text-xl font-bold tracking-tight text-natural-text">
                    TheraCenter
                  </h1>
                  <p className="text-[10px] text-natural-muted font-medium uppercase tracking-wider">Practice Dashboard</p>
                </div>
              </div>

              {/* Navigation Menu */}
              <nav className="flex-1 space-y-1">
                <button
                  onClick={() => setActiveTab('clients')}
                  className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 cursor-pointer font-medium transition-colors ${
                    activeTab === 'clients' ? 'bg-white/60 text-natural-sage shadow-xs' : 'text-natural-muted hover:text-natural-sage hover:bg-white/30'
                  }`}
                >
                  <Users className="w-4 h-4 shrink-0" />
                  Clients Registry
                </button>
                <button
                  onClick={() => setActiveTab('schedule')}
                  className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 cursor-pointer font-medium transition-colors ${
                    activeTab === 'schedule' ? 'bg-white/60 text-natural-sage shadow-xs' : 'text-natural-muted hover:text-natural-sage hover:bg-white/30'
                  }`}
                >
                  <Calendar className="w-4 h-4 shrink-0" />
                  Appointments
                </button>
                <button
                  onClick={() => setActiveTab('booking')}
                  className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 cursor-pointer font-medium transition-colors ${
                    activeTab === 'booking' ? 'bg-white/60 text-natural-sage shadow-xs' : 'text-natural-muted hover:text-natural-sage hover:bg-white/30'
                  }`}
                >
                  <MessageSquare className="w-4 h-4 shrink-0" />
                  Booking Assistant
                </button>
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

              {/* Google Sync Info Panel */}
              <div className="p-4 bg-white/30 rounded-2xl border border-white/50 mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 bg-emerald-600 rounded-full animate-pulse"></div>
                  <span className="text-[10px] uppercase tracking-wider font-bold text-natural-muted">Google Sync Active</span>
                </div>
                <p className="text-[11px] text-natural-muted/80 leading-tight">HIPAA Compliant Session</p>
              </div>

              {/* Practitioner User summary */}
              <div className="border-t border-natural-border/60 pt-4 mt-auto flex items-center justify-between text-xs text-natural-text">
                <div className="truncate pr-2">
                  <p className="font-bold text-natural-text truncate font-serif italic">{user?.displayName || 'Practitioner'}</p>
                  <p className="text-[10px] text-natural-muted truncate">{user?.email}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 rounded-xl bg-white/40 hover:bg-white/80 text-natural-muted hover:text-natural-sage transition-colors cursor-pointer"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Mobile Top Header (only visible on mobile screens) */}
            <div className="md:hidden flex items-center justify-between px-4 py-3.5 border-b border-natural-border bg-natural-sidebar shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-natural-sage text-white flex items-center justify-center font-bold text-xs shadow-sm">
                  𝜓
                </div>
                <span className="font-serif italic font-bold text-base text-natural-text tracking-tight">TheraCenter</span>
              </div>
              <button
                onClick={handleLogout}
                className="p-1.5 rounded-lg text-natural-muted hover:text-natural-text cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>

            {/* Main scrollable layout viewport */}
            <div className="flex-1 bg-white relative">
              <AnimatePresence mode="wait">
                {activeTab === 'clients' && (
                  <motion.div
                    key="tab-clients"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="h-full"
                  >
                    <ClientList
                      clients={clients}
                      accessToken={token!}
                      onSelectClient={(c) => {
                        setSelectedClient(c);
                        setActiveTab('detail');
                      }}
                      onAddClient={handleAddClient}
                    />
                  </motion.div>
                )}

                {activeTab === 'schedule' && (
                  <motion.div
                    key="tab-schedule"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="h-full"
                  >
                    <AppointmentScheduler
                      appointments={appointments}
                      clients={clients}
                      accessToken={token!}
                      onAddAppointment={handleAddAppointment}
                      onCancelAppointment={handleCancelAppointment}
                      onCompleteAppointment={handleCompleteAppointment}
                    />
                  </motion.div>
                )}

                {activeTab === 'booking' && (
                  <motion.div
                    key="tab-booking"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="h-full"
                  >
                    <BookingAssistant
                      clients={clients}
                      appointments={appointments}
                      accessToken={token!}
                      onAddAppointment={handleAddAppointment}
                      onAddClient={handleAddClient}
                    />
                  </motion.div>
                )}

                {activeTab === 'detail' && selectedClient && (
                  <motion.div
                    key="tab-detail"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="h-full"
                  >
                    <ClientDetail
                      client={selectedClient}
                      appointments={appointments}
                      accessToken={token!}
                      onBack={() => setActiveTab('clients')}
                      onUpdateClientDoc={(clientId, docId) => {
                        // Update active doc inside database state if they rebind/provision
                        setClients((prev) =>
                          prev.map((c) => (c.id === clientId ? { ...c, docId } : c))
                        );
                        if (selectedClient?.id === clientId) {
                          setSelectedClient({ ...selectedClient, docId });
                        }
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Mobile Tapping Tab Bar (iPhone Thumb Optimization) */}
            <div className="md:hidden border-t border-natural-border flex items-center justify-around py-3 bg-natural-sidebar shrink-0 absolute bottom-0 left-0 right-0 z-30 font-sans">
              <button
                onClick={() => setActiveTab('clients')}
                className={`flex flex-col items-center gap-0.5 text-[10px] font-sans font-semibold cursor-pointer ${
                  activeTab === 'clients' ? 'text-natural-sage' : 'text-natural-muted'
                }`}
              >
                <Users className="w-5 h-5" />
                <span>Clients</span>
              </button>
              <button
                onClick={() => setActiveTab('schedule')}
                className={`flex flex-col items-center gap-0.5 text-[10px] font-sans font-semibold cursor-pointer ${
                  activeTab === 'schedule' ? 'text-natural-sage' : 'text-natural-muted'
                }`}
              >
                <Calendar className="w-5 h-5" />
                <span>Schedule</span>
              </button>
              <button
                onClick={() => setActiveTab('booking')}
                className={`flex flex-col items-center gap-0.5 text-[10px] font-sans font-semibold cursor-pointer ${
                  activeTab === 'booking' ? 'text-natural-sage' : 'text-natural-muted'
                }`}
              >
                <MessageSquare className="w-5 h-5" />
                <span>Booking</span>
              </button>
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
