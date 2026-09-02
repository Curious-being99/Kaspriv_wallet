import React, { useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { useVirtualKeyboard } from '../context/KeyboardContext';
import { Contact } from '../types';
import { shortenAddress, validateKaspaAddress, getKaspaAddressType } from '../utils/kaspa';
import { 
  Users, 
  UserPlus, 
  Search, 
  Copy, 
  Trash2, 
  Edit2, 
  ArrowUpRight, 
  BookOpen, 
  Check, 
  X, 
  ShieldCheck, 
  ExternalLink 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const ContactsView: React.FC = () => {
  const { contacts, addContact, updateContact, deleteContact, showToast, setIsSendOpen, network } = useWallet();
  const { openKeyboard } = useVirtualKeyboard();

  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  // Form states
  const [nameInput, setNameInput] = useState('');
  const [addressInput, setAddressInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredContacts = contacts.filter((c) => {
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.address.toLowerCase().includes(q) ||
      (c.notes && c.notes.toLowerCase().includes(q))
    );
  });

  const handleOpenAdd = () => {
    setEditingContact(null);
    setNameInput('');
    setAddressInput('');
    setNotesInput('');
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (contact: Contact) => {
    setEditingContact(contact);
    setNameInput(contact.name);
    setAddressInput(contact.address);
    setNotesInput(contact.notes || '');
    setIsAddModalOpen(true);
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim() || !addressInput.trim()) {
      showToast('Name and address are required', 'error');
      return;
    }

    const validation = await validateKaspaAddress(addressInput.trim(), network);
    if (!validation.isValid) {
      showToast(validation.error || 'Invalid Kaspa address for current network', 'error');
      return;
    }

    if (editingContact) {
      updateContact(editingContact.id, nameInput, addressInput, notesInput);
    } else {
      addContact(nameInput, addressInput, notesInput);
    }

    setIsAddModalOpen(false);
    setNameInput('');
    setAddressInput('');
    setNotesInput('');
    setEditingContact(null);
  };

  const handleCopy = (address: string, id: string) => {
    navigator.clipboard.writeText(address);
    setCopiedId(id);
    showToast('Address copied to clipboard!', 'success');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSendToContact = (address: string) => {
    // Store in sessionStorage or dispatch state so SendModal picks it up, or use event / custom setter if available
    // Actually, we can store target address in window or localStorage for SendModal to read, or set it via a custom event
    localStorage.setItem('kaspriv_prefill_address', address);
    setIsSendOpen(true);
  };

  return (
    <div className="w-full space-y-4 pb-20">
      {/* Header Banner */}
      <div className="p-4 sm:p-5 kaspriv-card rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#70C7BA]/10 border border-[#70C7BA]/20 flex items-center justify-center text-[#70C7BA]">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
              Address Contacts
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Securely store recipient addresses with nicknames for quick sending.
            </p>
          </div>
        </div>

        <button
          onClick={handleOpenAdd}
          className="px-4 py-2.5 rounded-2xl bg-[#70C7BA] text-[#090D12] font-extrabold text-xs flex items-center justify-center gap-2 hover:bg-[#5bb2a4] transition-all cursor-pointer shadow-sm active:scale-95"
        >
          <UserPlus className="w-4 h-4 stroke-[2.5]" />
          <span>Add Contact</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onFocus={() => openKeyboard({ value: searchQuery, onChange: setSearchQuery })}
          onClick={() => openKeyboard({ value: searchQuery, onChange: setSearchQuery })}
          inputMode="none"
          onChange={() => {}}
          placeholder="Search contacts by nickname, address, or note..."
          className="w-full bg-[#0c141f] border border-[#212B38] rounded-2xl pl-11 pr-4 py-3 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-[#70C7BA] transition-colors cursor-pointer"
        />
      </div>

      {/* Contacts List Grid */}
      {filteredContacts.length === 0 ? (
        <div className="text-center py-16 kaspriv-card rounded-3xl space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-800/60 flex items-center justify-center mx-auto text-slate-400">
            <BookOpen className="w-6 h-6" />
          </div>
          <div className="text-sm font-bold text-slate-300">No contacts found</div>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            {searchQuery ? 'Try adjusting your search query.' : 'Add your first contact to get started with quick transfers.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredContacts.map((contact) => (
            <motion.div
              key={contact.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="kaspriv-card rounded-2xl p-4 space-y-3 border border-[#212B38]/60 hover:border-[#70C7BA]/40 transition-all group"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-extrabold text-slate-100 flex items-center gap-1.5">
                      {contact.name}
                    </h3>
                    {(() => {
                      const type = getKaspaAddressType(contact.address);
                      if (type === 'UNKNOWN') return null;
                      return (
                        <span className={`text-[8.5px] px-1.5 py-0.2 rounded font-bold border ${
                          type === 'P2SH'
                            ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                            : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                        }`}>
                          {type === 'P2SH' ? 'P2SH' : 'Standard'}
                        </span>
                      );
                    })()}
                  </div>
                  <p className="text-[11px] font-mono text-[#70C7BA] mt-0.5 break-all">
                    {contact.address}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleCopy(contact.address, contact.id)}
                    title="Copy Address"
                    className="p-2 rounded-xl bg-[#090D12] text-slate-300 hover:text-[#70C7BA] border border-[#212B38] transition-colors cursor-pointer"
                  >
                    {copiedId === contact.id ? <Check className="w-3.5 h-3.5 text-[#70C7BA]" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => handleOpenEdit(contact)}
                    title="Edit Contact"
                    className="p-2 rounded-xl bg-[#090D12] text-slate-300 hover:text-slate-100 border border-[#212B38] transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => deleteContact(contact.id)}
                    title="Delete Contact"
                    className="p-2 rounded-xl bg-[#090D12] text-rose-400 hover:bg-rose-500/10 border border-[#212B38] transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {contact.notes && (
                <p className="text-[11px] text-slate-400 bg-[#090D12] px-3 py-2 rounded-xl border border-[#212B38]/40">
                  {contact.notes}
                </p>
              )}

              <div className="pt-1 flex items-center justify-between text-[10px] text-slate-500">
                <span>Added {new Date(contact.createdAt).toLocaleDateString()}</span>
                <button
                  onClick={() => handleSendToContact(contact.address)}
                  className="px-3 py-1.5 rounded-xl bg-[#70C7BA]/10 text-[#70C7BA] font-extrabold flex items-center gap-1 hover:bg-[#70C7BA]/20 transition-all cursor-pointer"
                >
                  <ArrowUpRight className="w-3 h-3 stroke-[2.5]" />
                  <span>Send KAS</span>
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md kaspriv-card rounded-3xl p-5 sm:p-6 space-y-4 border border-[#212B38] shadow-2xl bg-[#0c141f]"
            >
              <div className="flex items-center justify-between border-b border-[#212B38]/60 pb-3">
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#70C7BA]" />
                  {editingContact ? 'Edit Contact' : 'New Address Contact'}
                </h3>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveContact} className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                    Nickname / Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={nameInput}
                    onFocus={() => openKeyboard({ value: nameInput, onChange: setNameInput })}
                    onClick={() => openKeyboard({ value: nameInput, onChange: setNameInput })}
                    inputMode="none" onChange={() => {}}
                    placeholder="e.g. Alice Exchange, Hardware Wallet"
                    className="w-full bg-[#090D12] border border-[#212B38] rounded-xl px-3 py-2.5 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-[#70C7BA] cursor-pointer"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                    Kaspa Address *
                  </label>
                  <input
                    type="text"
                    required
                    value={addressInput}
                    onFocus={() => openKeyboard({ value: addressInput, onChange: setAddressInput })}
                    onClick={() => openKeyboard({ value: addressInput, onChange: setAddressInput })}
                    inputMode="none" onChange={() => {}}
                    placeholder="kaspa:q... (Standard) or kaspa:p... (P2SH)"
                    className="w-full bg-[#090D12] border border-[#212B38] rounded-xl px-3 py-2.5 text-xs text-slate-100 font-mono placeholder-slate-500 outline-none focus:border-[#70C7BA] cursor-pointer"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                    Notes (Optional)
                  </label>
                  <textarea
                    value={notesInput}
                    onFocus={() => openKeyboard({ value: notesInput, onChange: setNotesInput })}
                    onClick={() => openKeyboard({ value: notesInput, onChange: setNotesInput })}
                    inputMode="none" onChange={() => {}}
                    placeholder="Add any reminders or tags..."
                    rows={2}
                    className="w-full bg-[#090D12] border border-[#212B38] rounded-xl px-3 py-2.5 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-[#70C7BA] resize-none cursor-pointer"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs hover:bg-slate-700 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl bg-[#70C7BA] text-[#090D12] font-extrabold text-xs hover:bg-[#5bb2a4] transition-all cursor-pointer shadow-sm"
                  >
                    {editingContact ? 'Update Contact' : 'Save Contact'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
