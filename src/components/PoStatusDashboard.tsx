import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Search, Clock, AlertTriangle, CheckCircle, FileText, DollarSign, Building, Briefcase, Calendar, Check, Save, Download, ChevronDown, ChevronUp, Users } from 'lucide-react';
import api from '../api';
import toast from 'react-hot-toast';

interface PoStatusDashboardProps {
  tickets: any[];
  allProjects: any[];
  fetchData: () => Promise<void>;
  role?: string;
}

export default function PoStatusDashboard({ tickets, allProjects, fetchData, role }: PoStatusDashboardProps) {
  const [showPaidList, setShowPaidList] = useState(false);

  // If role is ADMIN1, ensure showPaidList is always false
  useEffect(() => {
    if (role === 'ADMIN1' && showPaidList) {
      setShowPaidList(false);
    }
  }, [role, showPaidList]);

  // Filter tickets to show only those where Stage 2 is completed, and depending on showPaidList toggle
  // Since a single ticket database record can contain both a first invoice and an other (rescheduled/no-show) invoice,
  // we split each ticket into separate "invoice instances" so they can be processed, approved, and paid individually.
  const pendingTickets = React.useMemo(() => {
    const virtualTickets: any[] = [];
    tickets.forEach(t => {
      // 1) First Invoice / Booking
      const hasFirstInvoice = (t.first_invoice_number && t.first_invoice_number.trim() !== '') || (t.invoice_number && t.invoice_number.trim() !== '');
      if (hasFirstInvoice) {
        virtualTickets.push({
          ...t,
          invoice_type: 'first',
          invoice_number: (t.first_invoice_number || t.invoice_number || '').trim(),
          invoice_amount: t.invoice_amount,
          invoice_date: t.invoice_date || t.first_invoice_date,
          po_number: t.po_number,
          po_date: t.po_date,
          po_status: t.po_status || 'pending po approval',
          po_remarks: t.po_remarks,
          payment_date: t.payment_date,
          payment_invoice_numbers: t.payment_invoice_numbers,
          travel_agent: t.travel_agent,
          project_pos: t.project_pos
        });
      }

      // 2) Rescheduled / Other Invoice
      const hasOtherInvoice = t.other_invoice_number && t.other_invoice_number.trim() !== '';
      if (hasOtherInvoice) {
        virtualTickets.push({
          ...t,
          invoice_type: 'other',
          invoice_number: t.other_invoice_number.trim(),
          invoice_amount: t.other_invoice_amount || t.rescheduled_ticket_amount,
          invoice_date: t.other_invoice_date || t.rescheduled_ticket_date,
          po_number: t.other_po_number,
          po_date: t.other_po_date,
          po_status: t.other_po_status || 'pending po approval',
          po_remarks: t.other_po_remarks,
          payment_date: t.other_payment_date,
          payment_invoice_numbers: t.other_payment_invoice_numbers,
          travel_agent: t.other_travel_agent || t.rescheduled_ticket_agent,
          project_pos: t.other_project_pos
        });
      }
    });

    return virtualTickets.filter(t => {
      // If role is ADMIN1, only show tickets that already have a valid PO number assigned by Finance
      if (role === 'ADMIN1') {
        const hasPo = t.po_number && t.po_number.trim() !== '' && t.po_number.toLowerCase().trim() !== 'pending';
        if (!hasPo) return false;
      }

      if (showPaidList) {
        return t.po_status === 'payment done' && t.stage2_completed;
      } else {
        return t.po_status !== 'payment done' && t.stage2_completed;
      }
    });
  }, [tickets, showPaidList, role]);

  // Helper to parse any date format (ISO String, Firestore timestamp representation, Date, etc.)
  const parseDate = (val: any): Date | null => {
    if (!val) return null;
    if (typeof val === 'object') {
      if (typeof val.toDate === 'function') return val.toDate();
      if (typeof val.seconds === 'number') return new Date(val.seconds * 1000);
      if (typeof val._seconds === 'number') return new Date(val._seconds * 1000);
    }
    if (typeof val === 'string' || typeof val === 'number') {
      const dt = new Date(val);
      return isNaN(dt.getTime()) ? null : dt;
    }
    return null;
  };

  // Helper to get pending age for each ticket
  const getPendingDays = (ticket: any) => {
    const baseDate = parseDate(ticket.stage2_completed_at) || parseDate(ticket.created_at) || parseDate(ticket.updated_at);
    if (!baseDate) return 0;
    const current = new Date();
    const diffTime = current.getTime() - baseDate.getTime();
    return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
  };

  // Helper to format Stage 2 date cleanly
  const formatStage2Date = (val: any) => {
    const dt = parseDate(val);
    if (dt) {
      return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }
    return 'N/A';
  };

  // Helper to determine the best price/cost value for a ticket (invoice_amount with approved_rate fallback)
  const getTicketCost = (t: any): number => {
    const invAmt = Number(t.invoice_amount);
    if (t.invoice_amount !== undefined && t.invoice_amount !== null && t.invoice_amount !== '' && !isNaN(invAmt) && invAmt > 0) {
      return invAmt;
    }
    const appAmt = Number(t.approved_rate);
    if (t.approved_rate !== undefined && t.approved_rate !== null && t.approved_rate !== '' && !isNaN(appAmt) && appAmt > 0) {
      return appAmt;
    }
    return 0;
  };

  const overdueCount = pendingTickets.filter(t => getPendingDays(t) >= 7).length;

  const [options, setOptions] = useState<any[]>([]);
  const [isAddingNewAgent, setIsAddingNewAgent] = useState<Record<string, boolean>>({});
  const [newAgentName, setNewAgentName] = useState<Record<string, string>>({});

  useEffect(() => {
    api.get('/options')
      .then(res => setOptions(Array.isArray(res.data) ? res.data : []))
      .catch(err => console.error("Error fetching options:", err));
  }, []);

  const getFilteredOptions = (category: string) => {
    return options.filter(o => o.category === category);
  };

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('ALL');
  const [companyFilter, setCompanyFilter] = useState('ALL');

  // Group expanded/collapsed UI states
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Inline forms state - maps groupKey (e.g., "INV-xxx" or "TKT-yyy") to its edit form state
  const [formStates, setFormStates] = useState<Record<string, {
    po_status: string;
    po_remarks: string;
    po_number: string;
    invoice_number: string;
    invoice_amount: string;
    po_date?: string;
    invoice_date?: string;
    payment_date?: string;
    payment_invoice_numbers?: string;
    travel_agent?: string;
  }>>({});

  // Loading state per groupKey being saved
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});

  // Initialize form state for a group on-demand
  const getFormStateForGroup = (groupKey: string, groupTickets: any[]) => {
    if (!formStates[groupKey]) {
      const primary = groupTickets[0];
      const isGrouped = groupKey.startsWith('INV-');
      const totalAmount = groupTickets.reduce((sum, t) => {
        return sum + getTicketCost(t);
      }, 0);

      const parseInitialPaymentDate = (pd: any) => {
        if (!pd) return new Date().toISOString().split('T')[0];
        if (typeof pd === 'string') {
          const d = new Date(pd);
          return isNaN(d.getTime()) ? new Date().toISOString().split('T')[0] : d.toISOString().split('T')[0];
        }
        if (pd._seconds !== undefined) {
          return new Date(pd._seconds * 1000).toISOString().split('T')[0];
        }
        if (pd.seconds !== undefined) {
          return new Date(pd.seconds * 1000).toISOString().split('T')[0];
        }
        const d = new Date(pd);
        return isNaN(d.getTime()) ? new Date().toISOString().split('T')[0] : d.toISOString().split('T')[0];
      };

      return {
        po_status: primary.po_status || 'pending po approval',
        po_remarks: primary.po_remarks || '',
        po_number: primary.po_number || '',
        invoice_number: isGrouped ? groupKey.substring(4) : (primary.invoice_number || ''),
        invoice_amount: totalAmount > 0 ? String(totalAmount) : '',
        po_date: primary.po_date || '',
        invoice_date: primary.invoice_date || '',
        payment_date: parseInitialPaymentDate(primary.payment_date),
        payment_invoice_numbers: primary.payment_invoice_numbers || '',
        travel_agent: primary.travel_agent || ''
      };
    }
    return formStates[groupKey];
  };

  const handleInputChangeForGroup = (groupKey: string, groupTickets: any[], field: string, value: string) => {
    setFormStates(prev => ({
      ...prev,
      [groupKey]: {
        ...getFormStateForGroup(groupKey, groupTickets),
        [field]: value
      }
    }));
  };

  const handleAddNewAgent = async (groupKey: string, groupTickets: any[]) => {
    const name = newAgentName[groupKey];
    if (!name || !name.trim()) return;
    try {
      const res = await api.post('/options', { category: 'TRAVEL_AGENT', value: name.trim() });
      const newOpt = res.data;
      setOptions(prev => [...prev, newOpt]);
      
      setFormStates(prev => ({
        ...prev,
        [groupKey]: {
          ...getFormStateForGroup(groupKey, groupTickets),
          travel_agent: name.trim()
        }
      }));
      
      setIsAddingNewAgent(prev => ({ ...prev, [groupKey]: false }));
      setNewAgentName(prev => ({ ...prev, [groupKey]: '' }));
      toast.success(`Added and selected agent "${name.trim()}"`);
    } catch (err: any) {
      toast.error('Failed to add new travel agent');
    }
  };

  // Perform quick update API call for the entire group using the robust bulk-po API
  const handleSaveGroup = async (groupKey: string, ticketsInGroup: any[]) => {
    const state = getFormStateForGroup(groupKey, ticketsInGroup);
    setSavingIds(prev => ({ ...prev, [groupKey]: true }));
    const saveToast = toast.loading(`Updating invoice ${state.invoice_number || 'details'}...`);

    try {
      // Build a map of split amounts to preserve individual ticket invoice weights
      const totalAmt = Number(state.invoice_amount) || 0;
      const splitAmt = totalAmt / ticketsInGroup.length;
      const invoiceAmounts: Record<string, string> = {};
      ticketsInGroup.forEach(ticket => {
        invoiceAmounts[ticket.id] = String(splitAmt);
      });

      const payload = {
        invoice_number: state.invoice_number,
        po_number: state.po_number,
        po_date: state.po_date || new Date().toISOString().split('T')[0],
        invoice_date: state.invoice_date || new Date().toISOString().split('T')[0],
        invoice_amounts: invoiceAmounts,
        po_status: state.po_status,
        po_remarks: state.po_remarks || '',
        payment_date: state.payment_date || new Date().toISOString().split('T')[0],
        payment_invoice_numbers: state.payment_invoice_numbers || '',
        travel_agent: state.travel_agent || ''
      };

      await api.put('/finance/bulk-po', payload);
      
      toast.success('Invoice and PO details updated successfully!', { id: saveToast });
      await fetchData(); // refresh top-level data
    } catch (err: any) {
      console.error('Error saving PO status:', err);
      toast.error(err.response?.data?.detail || err.response?.data?.error || 'Failed to update invoice info', { id: saveToast });
    } finally {
      setSavingIds(prev => ({ ...prev, [groupKey]: false }));
    }
  };

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupKey]: !prev[groupKey]
    }));
  };

  // Extract unique active project IDs and Companies among pending tickets for filter lists
  const activeProjectIds = Array.from(new Set(pendingTickets.map(t => t.project_id).filter(Boolean)));
  const pendingProjects = allProjects.filter(p => activeProjectIds.includes(p.id));
  const pendingCompanies = Array.from(new Set(pendingTickets.map(t => t.company || 'Sanken Overseas')));

  // Filter list of pending tickets based on search query and drop down filters
  const filteredTickets = pendingTickets.filter(t => {
    const matchesSearch = 
      t.passenger_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.pp_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.po_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.invoice_number?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesProject = projectFilter === 'ALL' || t.project_id === projectFilter;
    const matchesCompany = companyFilter === 'ALL' || (t.company || 'Sanken Overseas') === companyFilter;

    return matchesSearch && matchesProject && matchesCompany;
  });

  // Calculate sums of pending amounts categorized by currency
  const pendingByCurrency = filteredTickets.reduce((acc, t) => {
    const curr = (t.currency || 'USD').toUpperCase();
    const cost = getTicketCost(t);
    acc[curr] = (acc[curr] || 0) + cost;
    return acc;
  }, {} as Record<string, number>);

  const handleDownload = () => {
    const doc = new jsPDF();
    doc.text(showPaidList ? "Completed Payments Summary" : "Pending PO Approval Summary", 14, 15);
    
    (doc as any).autoTable({
      head: [['Invoice Number', 'Connected PO', 'Route', 'Project', 'Amount', 'Traveler']],
      body: filteredTickets.map(t => [
        t.invoice_number || 'N/A',
        t.po_number || 'N/A',
        t.route || '-',
        allProjects.find(p => p.id === t.project_id)?.name || 'N/A',
        `${(t.currency || 'USD').toUpperCase() === 'LKR' ? 'LKR' : '$'} ${getTicketCost(t).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        `${t.passenger_name || ''} (${t.pp_number || ''})`
      ]),
    });
    doc.save('PO_Summary.pdf');
  };

  return (
    <div className="space-y-6">
      {/* Elegant Toggle Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => setShowPaidList(false)}
          className={`pb-3 px-5 text-sm font-bold border-b-2 transition-colors focus:outline-none ${
            !showPaidList
              ? 'border-sky-500 text-sky-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Pending PO & Payments
        </button>
        {role !== 'ADMIN1' && (
          <button
            type="button"
            onClick={() => setShowPaidList(true)}
            className={`pb-3 px-5 text-sm font-bold border-b-2 transition-colors focus:outline-none ${
              showPaidList
                ? 'border-emerald-500 text-emerald-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Completed Payments (Payment Done List)
          </button>
        )}
      </div>

      {!showPaidList && overdueCount > 0 && (
        <div className="bg-rose-50/90 border border-rose-200/80 rounded-xl p-4 flex items-center justify-between shadow-3xs">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-rose-100 rounded-lg text-rose-600 animate-pulse">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-rose-950">Timeline Alert: {overdueCount} {overdueCount === 1 ? 'ticket' : 'tickets'} exceeding 7-day threshold</h4>
              <p className="text-xs text-rose-700 mt-0.5">Finance attention high priority. These tickets have been in 'pending po approval' state for over a week.</p>
            </div>
          </div>
          <div className="hidden sm:block">
            <span className="text-xs bg-rose-100/80 text-rose-800 font-black px-2.5 py-1 rounded-full uppercase tracking-wider text-[10px]">
              Critical Aging
            </span>
          </div>
        </div>
      )}

      {/* Modern Filter Ribbon */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-1/3">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
            <Search size={18} />
          </span>
          <input
            type="text"
            placeholder="Search passenger, passport, PO, invoice..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all duration-150"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <button
            onClick={handleDownload}
            className="bg-indigo-600 text-white text-xs font-bold px-3 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-1.5"
          >
            <Download size={14} /> Export PDF
          </button>
          {/* Project Filter */}
          <div className="flex items-center space-x-2">
            <label className="text-xs font-bold text-slate-500 uppercase">Project:</label>
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="text-xs p-2 border border-slate-200 rounded-lg bg-white font-medium hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="ALL">All Projects</option>
              {pendingProjects.map((p, idx) => (
                <option key={p.id || `pending-proj-opt-${idx}`} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Company Filter */}
          <div className="flex items-center space-x-2">
            <label className="text-xs font-bold text-slate-500 uppercase">Re; company:</label>
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="text-xs p-2 border border-slate-200 rounded-lg bg-white font-medium hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="ALL">All Companies</option>
              {pendingCompanies.map((c, idx) => (
                <option key={c || `pending-comp-opt-${idx}`} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Container / Grid of Pending PO action cards */}
      {(() => {
        // Compute group values
        const invoiceGroupsMap = new Map<string, any[]>();
        filteredTickets.forEach(t => {
          const invNum = (t.invoice_number || '').trim().toUpperCase();
          const groupKey = invNum ? `INV-${invNum}` : `PENDING_INVOICE`;
          if (!invoiceGroupsMap.has(groupKey)) {
            invoiceGroupsMap.set(groupKey, []);
          }
          invoiceGroupsMap.get(groupKey)!.push(t);
        });

        const invoiceGroups = Array.from(invoiceGroupsMap.entries()).map(([groupKey, groupTickets]) => {
          const isGrouped = groupKey.startsWith('INV-');
          const invoiceNumber = isGrouped ? groupTickets[0].invoice_number : '';
          const primaryTicket = groupTickets[0];
          const maxPendingDays = Math.max(...groupTickets.map(t => getPendingDays(t)));
          const totalAmount = groupTickets.reduce((sum, t) => {
            return sum + getTicketCost(t);
          }, 0);

          return {
            groupKey,
            invoiceNumber,
            isGrouped,
            tickets: groupTickets,
            primaryTicket,
            maxPendingDays,
            totalAmount
          };
        });

        // Sort groups with the highest aging days first to prioritize critical actions
        invoiceGroups.sort((a, b) => b.maxPendingDays - a.maxPendingDays);

        if (invoiceGroups.length > 0) {
          return (
            <div className="space-y-4">
              {invoiceGroups.map(group => {
                const { groupKey, invoiceNumber, isGrouped, tickets: groupTickets, primaryTicket, maxPendingDays, totalAmount } = group;
                const state = getFormStateForGroup(groupKey, groupTickets);
                const isSaving = savingIds[groupKey] || false;
                const isExpanded = !!expandedGroups[groupKey];
                
                const pendingDays = maxPendingDays;
                const isExceeded = pendingDays >= 7;
                const isPoNumberMissingOrPending = !state.po_number || !state.po_number.trim() || state.po_number.toLowerCase().trim() === 'pending';

                // Line/badge/status styling indicators based on age
                let badgeStyle = "bg-emerald-50 text-emerald-800 border-emerald-250";
                let textAlert = "text-emerald-700";
                let topBarColor = "bg-emerald-400";

                if (pendingDays >= 7) {
                  badgeStyle = "bg-rose-50 text-rose-700 border-rose-300 animate-pulse";
                  textAlert = "text-rose-700 font-bold";
                  topBarColor = "bg-rose-600";
                } else if (pendingDays >= 4) {
                  badgeStyle = "bg-amber-50 text-amber-800 border-amber-300";
                  textAlert = "text-amber-700 font-semibold";
                  topBarColor = "bg-amber-400";
                } else {
                  badgeStyle = "bg-sky-50 text-sky-800 border-sky-200";
                  textAlert = "text-sky-700";
                  topBarColor = "bg-sky-400";
                }

                return (
                  <div
                    key={groupKey}
                    className="bg-white border border-slate-200 rounded-2xl shadow-3xs hover:shadow-2xs transition-all duration-200 relative overflow-hidden"
                  >
                    {/* Collapsible/Interactive Invoice Tab Header */}
                    <div
                      onClick={() => toggleGroup(groupKey)}
                      className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/50 select-none transition-colors border-b border-dashed border-slate-100"
                    >
                      <div className="flex items-center space-x-3.5 min-w-0 flex-1">
                        <div className={`h-10 w-10 ${isGrouped ? 'bg-indigo-50 text-indigo-700 border-indigo-150' : 'bg-slate-100 text-slate-700 border-slate-200'} rounded-xl flex items-center justify-center font-bold border flex-shrink-0`}>
                          <FileText size={20} />
                        </div>
                        
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-black text-slate-900 truncate">
                              {isGrouped ? `Invoice: ${invoiceNumber}` : `Pending Invoice Assignment`}
                            </h4>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-50 border border-indigo-100 text-indigo-750">
                              {groupTickets.length} {groupTickets.length === 1 ? 'Passenger' : 'Passengers'}
                            </span>
                          </div>
                          
                          {/* List of passengers under this Invoice */}
                          {isExpanded && (
                            <p className="text-xs text-slate-500 mt-1 truncate" title={groupTickets.map(t => t.passenger_name).join(', ')}>
                              <span className="font-semibold text-slate-700">Travelers: </span>
                              {groupTickets.map(t => `${t.passenger_name} (${t.pp_number || 'No Passport'})`).join(', ')}
                            </p>
                          )}

                          <p className="text-[11.5px] font-semibold text-slate-600 mt-1.5 flex items-center gap-1.5">
                            <span>PO Code:</span>
                            <span className="font-mono bg-indigo-50/70 px-1.5 py-0.25 rounded border border-indigo-100 text-indigo-800">
                              {state.po_number || 'Pending'}
                            </span>
                          </p>
                        </div>
                      </div>

                      {/* Right side info & action */}
                      <div className="flex items-center space-x-4 self-end md:self-auto flex-shrink-0">
                        {/* Cost aggregate */}
                        <div className="text-right">
                          <span className="block text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Invoice Cost</span>
                          <span className="text-sm font-black text-slate-950">
                            {(primaryTicket.currency || 'USD').toUpperCase() === 'LKR' ? 'LKR ' : '$'}{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>

                        {/* Queue Age badge */}
                        <div className={`text-[10px] px-2.5 py-1 rounded-full border flex items-center gap-1.5 font-bold ${badgeStyle}`}>
                          <span className="relative flex h-2 w-2">
                            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isExceeded ? 'bg-rose-400' : pendingDays >= 4 ? 'bg-amber-400' : 'bg-sky-400'} opacity-75`}></span>
                            <span className={`relative inline-flex rounded-full h-2 w-2 ${isExceeded ? 'bg-rose-500' : pendingDays >= 4 ? 'bg-amber-500' : 'bg-sky-500'}`}></span>
                          </span>
                          <Clock size={11} className={isExceeded ? "animate-spin" : ""} />
                          <span>{pendingDays}d aging</span>
                        </div>

                        {/* Collapsible toggle chevron */}
                        <div className="text-slate-400 p-1 bg-slate-50 border border-slate-150 rounded-lg">
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </div>
                    </div>

                    {/* Detailed expandable section containing Passenger breaks and ERP Entry Form */}
                    {isExpanded && (
                      <div className="p-6 bg-slate-50/30 space-y-6">
                        
                        {/* Passengers list table */}
                        <div>
                          <h5 className="text-[11px] font-black uppercase text-slate-500 tracking-wider mb-2.5 flex items-center gap-1.5">
                            <Users size={12} className="text-slate-400" />
                            Travelers Summarized Under Invoice
                          </h5>
                          
                          <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-3xs">
                            <table className="min-w-full divide-y divide-slate-150 text-left">
                              <thead className="bg-slate-50">
                                <tr>
                                  <th className="px-4 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Passenger</th>
                                  <th className="px-4 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Passport No</th>
                                  <th className="px-4 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Project</th>
                                  <th className="px-4 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Route</th>
                                  <th className="px-4 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Company</th>
                                  <th className="px-4 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Departure Date</th>
                                  <th className="px-4 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-right">Individual Cost</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-[11px] text-slate-650">
                                {groupTickets.map((t, idx) => {
                                  const proj = allProjects.find(p => p.id === t.project_id);
                                  return (
                                    <tr key={`${t.id}-${idx}`} className="hover:bg-slate-50/50">
                                      <td className="px-4 py-2.5 font-bold text-slate-900">{t.passenger_name}</td>
                                      <td className="px-4 py-2.5 font-mono text-slate-500">{t.pp_number || '-'}</td>
                                      <td className="px-4 py-2.5 truncate max-w-[130px]" title={proj?.name}>{proj?.name || 'Unassigned'}</td>
                                      <td className="px-4 py-2.5">{t.route || '-'}</td>
                                      <td className="px-4 py-2.5">{t.company || 'Sanken Overseas'}</td>
                                      <td className="px-4 py-2.5 font-semibold text-slate-705 inline-flex items-center gap-1">
                                        <Calendar size={11} className="text-slate-400" />
                                        {t.rescheduled_departure_date || t.departure_date || '-'}
                                      </td>
                                      <td className="px-4 py-2.5 text-right font-semibold text-slate-900">
                                        {t.invoice_amount ? (
                                          <span className="text-emerald-700">{(t.currency || 'USD').toUpperCase() === 'LKR' ? 'LKR ' : '$'}{Number(t.invoice_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        ) : (
                                          <span className="text-slate-500">{(t.currency || 'USD').toUpperCase() === 'LKR' ? 'LKR ' : '$'}{Number(t.approved_rate || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} <span className="text-[10px] text-slate-400 font-normal block">(Approved Rate fallback)</span></span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Input details and Timeline trackers */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start pt-4 border-t border-dashed border-slate-200">
                          
                          {/* Inner Left: Details */}
                          <div className="lg:col-span-4 space-y-4">
                            
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-150">
                              <p className="text-[11px] font-black uppercase text-slate-500 tracking-wider mb-3">Ticket Information</p>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs text-slate-500 font-semibold">
                                <div>
                                  <span className="block text-slate-400 font-medium text-[10px] uppercase">Re; company</span>
                                  <span className="text-slate-800">{primaryTicket.company || 'Sanken Overseas'}</span>
                                </div>
                                <div>
                                  <span className="block text-slate-400 font-medium text-[10px] uppercase">Travel Agent</span>
                                  <span className="text-slate-800">{primaryTicket.travel_agent || '-'}</span>
                                </div>
                                <div>
                                  <span className="block text-slate-400 font-medium text-[10px] uppercase">Ticket Type</span>
                                  <span className="text-slate-800">{primaryTicket.ticket_type}</span>
                                </div>
                                <div>
                                  <span className="block text-slate-400 font-medium text-[10px] uppercase">Job Category</span>
                                  <span className="text-slate-800 truncate block max-w-[150px]" title={primaryTicket.job_category}>{primaryTicket.job_category || '-'}</span>
                                </div>
                              </div>
                            </div>

                          </div>

                          {/* Inner Middle: Form Details */}
                          <div className="lg:col-span-5 bg-slate-50/70 rounded-xl border border-slate-150 p-4 space-y-3.5">
                            <p className="text-[11px] font-black uppercase text-slate-500 tracking-wider">Approval & Billing Details</p>
                            
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">PO Number</label>
                                <input
                                  type="text"
                                  value={state.po_number}
                                  onChange={(e) => handleInputChangeForGroup(groupKey, groupTickets, 'po_number', e.target.value)}
                                  placeholder="e.g. PO-8902"
                                  disabled={primaryTicket.stage3_completed || role === 'ADMIN1'}
                                  className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">Invoice Number</label>
                                <input
                                  type="text"
                                  value={state.invoice_number}
                                  onChange={(e) => handleInputChangeForGroup(groupKey, groupTickets, 'invoice_number', e.target.value)}
                                  placeholder="e.g. INV-1002"
                                  disabled={primaryTicket.stage3_completed}
                                  className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                                />
                              </div>
                            </div>

                             <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">
                                  Invoice Amount ({(primaryTicket.currency || 'USD').toUpperCase()})
                                </label>
                                <div className="relative">
                                  <span className="absolute inset-y-0 left-0 flex items-center pl-2 text-slate-400 pointer-events-none text-[10px]">
                                    {(primaryTicket.currency || 'USD').toUpperCase() === 'LKR' ? 'LKR' : '$'}
                                  </span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={state.invoice_amount}
                                    onChange={(e) => handleInputChangeForGroup(groupKey, groupTickets, 'invoice_amount', e.target.value)}
                                    placeholder="0.00"
                                    disabled={primaryTicket.stage3_completed}
                                    className={`w-full ${(primaryTicket.currency || 'USD').toUpperCase() === 'LKR' ? 'pl-8' : 'pl-6'} pr-2 py-2 border border-slate-200 rounded-lg text-xs bg-white outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed`}
                                  />
                                </div>
                              </div>

                              {role === 'ADMIN1' && isPoNumberMissingOrPending ? (
                                <div className="flex flex-col justify-center bg-amber-50/50 border border-amber-200/60 rounded-lg p-2.5 text-[11px] text-amber-700 font-medium">
                                  <span>⚠️ Enter & save a valid PO Number to enable Payment updates.</span>
                                </div>
                              ) : (
                                <div className="flex flex-col justify-end">
                                  <label className="block text-xs font-bold text-slate-600 mb-1">PO Status</label>
                                  <select
                                    value={state.po_status}
                                    onChange={(e) => handleInputChangeForGroup(groupKey, groupTickets, 'po_status', e.target.value)}
                                    className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 focus:ring-2 focus:ring-sky-500"
                                  >
                                    <option value="pending po approval">pending po approval</option>
                                    <option value="check cannot proceed">check cannot proceed</option>
                                    <option value="payment done">payment done</option>
                                  </select>
                                </div>
                              )}
                            </div>

                            {state.po_status === 'payment done' && !(role === 'ADMIN1' && isPoNumberMissingOrPending) && (
                              <div className="border-t border-slate-200 pt-3 mt-3 space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">Payment Date</label>
                                    <input
                                      type="date"
                                      value={state.payment_date || ''}
                                      onChange={(e) => handleInputChangeForGroup(groupKey, groupTickets, 'payment_date', e.target.value)}
                                      className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">Payment Invoice / Receipt Numbers</label>
                                    <input
                                      type="text"
                                      value={state.payment_invoice_numbers || ''}
                                      onChange={(e) => handleInputChangeForGroup(groupKey, groupTickets, 'payment_invoice_numbers', e.target.value)}
                                      placeholder="Receipt or Ref numbers"
                                      className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                                    />
                                  </div>
                                </div>

                                <div>
                                  <label className="block text-xs font-bold text-slate-600 mb-1">Paid To (Travel Agent)</label>
                                  {!isAddingNewAgent[groupKey] ? (
                                    <div className="flex gap-2">
                                      <select
                                        value={state.travel_agent || ''}
                                        onChange={(e) => {
                                          if (e.target.value === '__NEW__') {
                                            setIsAddingNewAgent(prev => ({ ...prev, [groupKey]: true }));
                                          } else {
                                            handleInputChangeForGroup(groupKey, groupTickets, 'travel_agent', e.target.value);
                                          }
                                        }}
                                        className="flex-1 p-2 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 focus:ring-2 focus:ring-sky-500"
                                      >
                                        <option value="">Select Travel Agent</option>
                                        {getFilteredOptions('TRAVEL_AGENT').map((opt: any, idx: number) => (
                                          <option key={opt.id || `agent-opt-${opt.value}-${idx}`} value={opt.value}>
                                            {opt.value}
                                          </option>
                                        ))}
                                        <option value="__NEW__" className="text-sky-600 font-bold">+ Add New Travel Agent</option>
                                      </select>
                                    </div>
                                  ) : (
                                    <div className="flex gap-2">
                                      <input
                                        type="text"
                                        value={newAgentName[groupKey] || ''}
                                        onChange={(e) => setNewAgentName(prev => ({ ...prev, [groupKey]: e.target.value }))}
                                        placeholder="Enter agent name"
                                        className="flex-1 p-2 border border-slate-200 rounded-lg text-xs bg-white outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleAddNewAgent(groupKey, groupTickets)}
                                        className="px-3 py-2 bg-slate-900 text-white font-bold text-xs rounded-lg hover:bg-slate-800 cursor-pointer"
                                      >
                                        Add
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setIsAddingNewAgent(prev => ({ ...prev, [groupKey]: false }))}
                                        className="px-3 py-2 bg-slate-200 text-slate-700 font-bold text-xs rounded-lg hover:bg-slate-300 cursor-pointer"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Inner Right: Remarks / Logic triggers */}
                          <div className="lg:col-span-3 flex flex-col justify-between h-full space-y-4">
                            <div>
                              <label className="block text-xs font-bold text-slate-600 mb-1">Finance Remarks / Reasons</label>
                              <textarea
                                value={state.po_remarks}
                                onChange={(e) => handleInputChangeForGroup(groupKey, groupTickets, 'po_remarks', e.target.value)}
                                placeholder="Add remarks or notes about status here..."
                                rows={3}
                                className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white outline-none focus:ring-2 focus:ring-sky-500 transition-all min-h-[76px]"
                              />
                            </div>

                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => handleSaveGroup(groupKey, groupTickets)}
                              className="w-full inline-flex items-center justify-center px-4 py-2.5 border border-transparent text-sm font-bold rounded-lg text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 shadow-sm transition-colors duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-pink-500 font-sans"
                            >
                              {isSaving ? (
                                <span className="flex items-center space-x-2">
                                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                  <span>Saving Group...</span>
                                </span>
                              ) : (
                                <span className="flex items-center space-x-1.5">
                                  <Save size={16} />
                                  <span>Update Invoice Group</span>
                                </span>
                              )}
                            </button>
                          </div>

                        </div>

                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        } else {
          return (
            <div className="bg-slate-50 border border-slate-200 border-dashed rounded-2xl py-12 px-4 text-center animate-fade-in">
              <div className="inline-flex h-12 w-12 bg-slate-100 rounded-full items-center justify-center text-slate-400 mb-3 border border-slate-200">
                <CheckCircle size={24} />
              </div>
              <h3 className="text-sm font-semibold text-slate-900">All caught up!</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                No tickets are currently waiting for PO approval under the selected filter criteria.
              </p>
            </div>
          );
        }
      })()}
    </div>
  );
}
