import React, { useState } from 'react';
import { User, Search, Plus, Phone, Mail, FileText, ChevronRight, Loader2, Sparkles } from 'lucide-react';
import { Client } from '../types';
import { createClientGoogleDoc } from '../googleApi';
import { motion, AnimatePresence } from 'motion/react';

interface ClientListProps {
  clients: Client[];
  accessToken: string;
  onSelectClient: (client: Client) => void;
  onAddClient: (client: Client) => void;
}

export default function ClientList({
  clients,
  accessToken,
  onSelectClient,
  onAddClient,
}: ClientListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Filter clients by search
  const filteredClients = clients.filter((c) =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Form submit
  const handleAddClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsProvisioning(true);
    setFormError(null);

    try {
      // 1. Provision a secure Google Doc in Google Drive instantly
      console.log(`Provisioning secure Google Doc notes file for ${name}...`);
      const docId = await createClientGoogleDoc(name, accessToken);
      console.log(`Successfully created Google Doc with ID: ${docId}`);

      // 2. Build and save client object
      const newClient: Client = {
        id: Math.random().toString(36).substr(2, 9),
        name,
        email: email || 'No email specified',
        phone: phone || 'No phone specified',
        docId: docId,
        createdAt: new Date().toISOString(),
      };

      onAddClient(newClient);

      // Reset form
      setName('');
      setEmail('');
      setPhone('');
      setFormError(null);
      setShowAddForm(false);
    } catch (error: any) {
      console.error('Failed to register client or create Doc:', error);
      setFormError(error?.message || 'Could not connect to Google Drive. Please log out and sign in again to refresh your permissions.');
    } finally {
      setIsProvisioning(false);
    }
  };

  return (
    <div className="flex flex-col h-full font-sans max-w-lg mx-auto bg-white" id="client-list-view">
      {/* Search and Title Header */}
      <div className="border-b border-natural-border px-4 py-4 space-y-3 shrink-0 bg-natural-sidebar/20">
        <div className="flex items-center justify-between">
          <h2 className="font-serif italic text-lg font-bold text-natural-text tracking-tight">Active Client Registry</h2>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-natural-sage hover:bg-natural-sage-light text-white font-sans text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" /> Onboard Client
          </button>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="w-4 h-4 text-natural-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by client name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-natural-bg/50 border border-natural-border rounded-xl pl-9 pr-4 py-2 text-xs text-natural-text font-sans focus:outline-none focus:border-natural-sage"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5 pb-24">
        {/* Onboarding Form */}
        <AnimatePresence>
          {showAddForm && (
            <motion.form
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              onSubmit={handleAddClientSubmit}
              className="bg-natural-bg border border-natural-border rounded-2xl p-4 space-y-3 overflow-hidden text-xs"
            >
              <h3 className="font-serif italic font-bold text-natural-sage text-sm mb-1">
                Onboard New Client
              </h3>

              {formError && (
                <div className="bg-rose-50 border border-rose-100 text-rose-950 p-3 rounded-xl space-y-1">
                  <p className="font-bold">Google API Connection Issue</p>
                  <p className="text-[11px] leading-relaxed text-rose-900">{formError}</p>
                  <p className="text-[10px] text-rose-800/80 pt-1">
                    Tip: Try logging out using the bottom-left logout button and signing back in to re-authorize Google Workspace.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-wider text-natural-muted mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="E.g., John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-white border border-natural-border rounded-xl px-3 py-2 text-natural-text font-sans focus:outline-none focus:border-natural-sage"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] uppercase font-bold tracking-wider text-natural-muted mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      placeholder="john@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-white border border-natural-border rounded-xl px-3 py-2 text-natural-text font-sans focus:outline-none focus:border-natural-sage"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold tracking-wider text-natural-muted mb-1">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      placeholder="(555) 019-2834"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-white border border-natural-border rounded-xl px-3 py-2 text-natural-text font-sans focus:outline-none focus:border-natural-sage"
                    />
                  </div>
                </div>

                <div className="bg-white border border-natural-border/60 rounded-xl p-2.5 text-[10px] text-natural-muted font-medium flex gap-2 items-center">
                  <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                  <p>
                    <strong>Automated Folder Provisioning:</strong> This will automatically create a secure clinical case notes file in your personal Google Drive and link it to this client.
                  </p>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 bg-natural-sidebar hover:bg-natural-border/60 text-natural-text font-bold py-2 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProvisioning}
                  className="flex-1 bg-natural-sage hover:bg-natural-sage-light text-white font-bold py-2 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isProvisioning ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Provisioning...
                    </>
                  ) : (
                    'Provision & Register'
                  )}
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Client Cards List */}
        <div className="space-y-2.5">
          {filteredClients.length === 0 ? (
            <p className="text-xs text-natural-muted italic text-center py-8">
              No clients found matching that name.
            </p>
          ) : (
            filteredClients.map((client) => (
              <div
                key={client.id}
                onClick={() => onSelectClient(client)}
                className="bg-white border border-[#e0e0d6] rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:border-natural-sage hover:shadow-xs transition-all"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-natural-bg text-natural-sage flex items-center justify-center text-sm font-bold border border-natural-border">
                    {client.name.split(' ').map((n) => n[0]).join('')}
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-natural-text">{client.name}</h3>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-natural-muted">
                      <span className="flex items-center gap-0.5 font-mono">
                        <FileText className="w-3 h-3 text-natural-muted" />
                        Notes Linked
                      </span>
                      <span>•</span>
                      <span>{client.phone}</span>
                    </div>
                  </div>
                </div>

                <ChevronRight className="w-4 h-4 text-natural-muted" />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
