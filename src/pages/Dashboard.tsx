import React, { useEffect, useState, useMemo, useRef } from 'react';
import api from '../api';
import toast from 'react-hot-toast';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { useAuthStore } from '../store';
import { LogOut, Plus, Search, Download, AlertCircle, AlertTriangle, X, Upload, Image, Eye, Trash2, LayoutGrid, List, FileText, File, ExternalLink, ChevronDown, ChevronUp, Users, Award, TrendingUp, SlidersHorizontal, RefreshCw, Calendar, Plane } from 'lucide-react';
import { motion } from 'motion/react';
import { useNavigate, Navigate } from 'react-router-dom';
import { format } from 'date-fns';
import NewTicketModal from '../components/NewTicketModal';
import UpdateFlightStatusModal from '../components/UpdateFlightStatusModal';
import ConfirmationModal from '../components/ConfirmationModal';
import PoStatusDashboard from '../components/PoStatusDashboard';
import DonutChart from '../components/DonutChart';

export const isPdfUrl = (url: string | null): boolean => {
  if (!url) return false;
  return url.startsWith('data:application/pdf') || url.includes('.pdf') || url.includes('pdf;base64');
};

export const isWebUrl = (url: string | null): boolean => {
  if (!url) return false;
  return (url.startsWith('http://') || url.startsWith('https://')) && !url.startsWith('data:');
};

export const getGroupSummaryStatus = (tickets: any[]) => {
  if (!tickets || tickets.length === 0) {
    return { label: 'No Passenger Records', bgClass: 'bg-slate-150 text-slate-700 border-slate-250' };
  }

  const allCompleted = tickets.every(t => t.status === 'COMPLETED');
  const allPaid = tickets.every(t => t.po_status === 'payment done');
  
  const hasCannotProceed = tickets.some(t => t.po_status === 'check cannot proceed');
  const hasPendingApproval = tickets.some(t => t.po_status === 'pending po approval');
  const hasUnderReview = tickets.some(t => t.po_status === 'under review');
  
  const hasOpenTicket = tickets.some(t => t.status === 'OPEN');
  const hasInProgressTicket = tickets.some(t => t.status === 'IN_PROGRESS' || t.status === 'pending');

  if (hasCannotProceed) {
    return {
      label: 'Payment Blocked',
      bgClass: 'bg-rose-100 border-rose-300 text-red-700 shadow-3xs font-extrabold'
    };
  }

  if (allPaid && allCompleted) {
    return {
      label: 'Paid & Completed',
      bgClass: 'bg-emerald-100 border-emerald-300 text-emerald-800 shadow-3xs font-extrabold'
    };
  }

  if (allPaid) {
    return {
      label: 'Payment Done',
      bgClass: 'bg-teal-100 border-teal-300 text-teal-800 shadow-3xs font-extrabold'
    };
  }

  if (hasPendingApproval) {
    return {
      label: 'Pending PO Approval',
      bgClass: 'bg-amber-100 border-amber-300 text-amber-800 shadow-3xs font-extrabold'
    };
  }

  if (hasUnderReview) {
    return {
      label: 'Under Review',
      bgClass: 'bg-purple-100 border-purple-300 text-purple-800 shadow-3xs font-semibold'
    };
  }

  if (hasInProgressTicket) {
    return {
      label: 'Ticketing In Progress',
      bgClass: 'bg-blue-100 border-blue-300 text-blue-700 shadow-3xs font-semibold'
    };
  }

  if (hasOpenTicket) {
    return {
      label: 'Booking Opened',
      bgClass: 'bg-indigo-100 border-indigo-300 text-indigo-700 shadow-3xs font-semibold'
    };
  }

  if (allCompleted) {
    return {
      label: 'Completed',
      bgClass: 'bg-sky-100 border-sky-300 text-sky-800 shadow-3xs font-semibold'
    };
  }

  return {
    label: 'Pending PO/Settlement',
    bgClass: 'bg-slate-100 border-slate-300 text-slate-600 font-semibold'
  };
};

const STATUS_DESCRIPTIONS: Record<string, string> = {
  'COMPLETED': 'Tickets that have reached the final stage.',
  'IN_PROGRESS': 'Tickets currently being processed.',
  'UNKNOWN': 'Tickets with unknown or pending status.'
};

export const TicketProgressBar = ({ ticket }: { ticket: any }) => {
  const s1 = !!ticket.stage1_completed;
  const s2 = !!ticket.stage2_completed;
  const s3 = !!ticket.stage3_completed;
  const s4 = ticket.po_status === 'payment done';
  
  let completedCount = 0;
  if (s1) completedCount++;
  if (s2) completedCount++;
  if (s3) completedCount++;
  if (s4) completedCount++;
  
  const pct = Math.round((completedCount / 4) * 100);
  
  const stage1Color = s1 ? 'bg-indigo-500 shadow-xs shadow-indigo-100' : 'bg-slate-200/70';
  const stage2Color = s2 ? 'bg-sky-500 shadow-xs shadow-sky-100' : 'bg-slate-200/70';
  const stage3Color = s3 ? 'bg-teal-500 shadow-xs shadow-teal-100' : 'bg-slate-200/70';
  const stage4Color = s4 ? 'bg-emerald-500 shadow-xs shadow-emerald-100' : 'bg-slate-200/70';

  const label = s4 
    ? 'Payment Done' 
    : s3 
      ? 'PO Complete' 
      : s2 
        ? 'Agent Complete' 
        : s1 
          ? 'Admin Complete' 
          : 'Draft';

  const badgeColor = s4
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
    : s3
      ? 'bg-teal-50 text-teal-700 border-teal-200/60'
      : s2
        ? 'bg-sky-50 text-sky-700 border-sky-200/60'
        : s1
          ? 'bg-indigo-50 text-indigo-700 border-indigo-200/60'
          : 'bg-slate-50 text-slate-500 border-slate-200/60';

  return (
    <div className="w-full max-w-[210px] space-y-1.5 py-0.5" onClick={(e) => e.stopPropagation()}>
      <div className="flex justify-between items-center select-none">
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold border ${badgeColor} transition-all duration-300`}>
          {label}
        </span>
        <span className="font-mono text-[10px] font-black text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md">
          {completedCount}/4
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1 h-1.5 w-full bg-transparent select-none">
        <div className={`h-full rounded-full transition-all duration-500 ${stage1Color}`} title="Admin Status" />
        <div className={`h-full rounded-full transition-all duration-500 ${stage2Color}`} title="Agent Status" />
        <div className={`h-full rounded-full transition-all duration-500 ${stage3Color}`} title="PO Status" />
        <div className={`h-full rounded-full transition-all duration-500 ${stage4Color}`} title="Payment Status" />
      </div>
      
      <div className="flex justify-between items-center text-[8.5px] font-bold text-slate-400 select-none px-0.5 pt-0.5">
        <span className={`flex items-center space-x-0.5 transition-colors duration-300 ${s1 ? 'text-indigo-600 font-extrabold' : 'text-slate-400 font-medium'}`}>
          <span className={`w-1 h-1 rounded-full ${s1 ? 'bg-indigo-500' : 'bg-slate-300'}`} />
          <span>Admin</span>
        </span>
        <span className={`flex items-center space-x-0.5 transition-colors duration-300 ${s2 ? 'text-sky-600 font-extrabold' : 'text-slate-400 font-medium'}`}>
          <span className={`w-1 h-1 rounded-full ${s2 ? 'bg-sky-500' : 'bg-slate-300'}`} />
          <span>Agent</span>
        </span>
        <span className={`flex items-center space-x-0.5 transition-colors duration-300 ${s3 ? 'text-teal-600 font-extrabold' : 'text-slate-400 font-medium'}`}>
          <span className={`w-1 h-1 rounded-full ${s3 ? 'bg-teal-500' : 'bg-slate-300'}`} />
          <span>PO</span>
        </span>
        <span className={`flex items-center space-x-0.5 transition-colors duration-300 ${s4 ? 'text-emerald-600 font-extrabold' : 'text-slate-400 font-medium'}`}>
          <span className={`w-1 h-1 rounded-full ${s4 ? 'bg-emerald-500' : 'bg-slate-300'}`} />
          <span>Payment</span>
        </span>
      </div>
    </div>
  );
};

export const renderStatusBadge = (status: string) => {
  const badgeConfig: Record<string, { classes: string; label: string; tooltip: string; pulse?: boolean }> = {
    'COMPLETED': { 
        classes: "bg-emerald-50 text-emerald-700 border-emerald-250",
        label: "Completed",
        tooltip: "Ticket processing is fully completed.",
        pulse: true
    },
    'DRAFT': { 
        classes: "bg-slate-100 text-slate-650 border-slate-200",
        label: "Draft",
        tooltip: "Ticket is currently a draft."
    },
    'IN_PROGRESS': { 
        classes: "bg-blue-50 text-blue-700 border-blue-200",
        label: "In Progress",
        tooltip: "Ticket is currently being processed."
    }
  };

  const config = badgeConfig[status] || {
      classes: "bg-blue-50 text-blue-700 border-blue-200",
      label: "In Progress",
      tooltip: "Ticket is currently being processed."
  };

  return (
    <div className="relative group inline-block">
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border shadow-3xs transition-all duration-200 hover:scale-105 hover:shadow-sm ${config.classes}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${config.pulse ? 'bg-emerald-500 animate-pulse' : 'bg-current'}`} />
          <span>{config.label}</span>
        </span>
        <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
            {config.tooltip}
        </span>
    </div>
  );
};

export const renderFlightStatusBadge = (flight_status: string | null, departure_date?: string) => {
  const status = flight_status || 'PENDING';
  let classes = "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border leading-none select-none shadow-3xs transition-all duration-200 hover:scale-105 hover:shadow-sm";
  let label = status;
  let tooltip = `Flight status: ${status}`;
  let extra = null;

  if (status === 'PENDING') {
    if (departure_date && departure_date < format(new Date(), 'yyyy-MM-dd')) {
        classes += " bg-rose-50 text-rose-650 border-rose-200";
        label = "Update Required";
        tooltip = "Flight update is required as departure date has passed.";
        extra = <AlertCircle className="w-3.5 h-3.5 mr-1 text-rose-500" />;
    } else {
        classes += " bg-slate-50 text-slate-500 border-slate-200/60";
        label = "Pending";
        tooltip = "Flight status is currently pending.";
    }
  } else if (status === 'NO_SHOW') {
    classes += " border-red-250 bg-red-50 text-red-700";
    label = "No Show";
    tooltip = "Passenger did not show for the flight.";
    extra = (
        <span className="relative flex h-1.5 w-1.5 mr-1 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-600"></span>
        </span>
    );
  } else if (status === 'DEPARTED') {
    classes += " border-emerald-250 bg-emerald-50 text-emerald-700";
    label = "Departed";
    tooltip = "Flight has departed.";
    extra = <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />;
  } else {
    classes += " border-sky-250 bg-sky-50 text-sky-700";
    label = status.toLowerCase();
    tooltip = `Flight status: ${status.toLowerCase()}`;
  }

  return (
    <div className="relative group inline-block">
        <span className={classes}>
            {extra}
            {label}
        </span>
        <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
            {tooltip}
        </span>
    </div>
  );
};

const isInvoicePending = (t: any) => {
  if (!t) return false;
  const isFirstAttemptPending = !t.first_invoice_number || !t.first_invoice_number.trim();
  const isSecondAttemptActive = ['NO_SHOW', 'CANCELLED', 'RESCHEDULED'].includes(t.flight_status);
  const isSecondAttemptPending = isSecondAttemptActive && (!t.other_invoice_number || !t.other_invoice_number.trim());
  return isFirstAttemptPending || isSecondAttemptPending;
};

export default function Dashboard() {
  const { role, logout, user, token } = useAuthStore();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<any>(null);
  const [flightStatus, setFlightStatus] = useState<any>({});
  const [projects, setProjects] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [allProjects, setAllProjects] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [backgroundSyncing, setBackgroundSyncing] = useState(false);
  const [syncedCount, setSyncedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const fetchIdRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [flightUpdateTicket, setFlightUpdateTicket] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [agentFilter, setAgentFilter] = useState('ALL');
  const [ticketTypeFilter, setTicketTypeFilter] = useState('ALL');
  const [donutType, setDonutType] = useState<'WORKFLOW' | 'FLIGHT'>('FLIGHT');
  const [options, setOptions] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [entitlementSearch, setEntitlementSearch] = useState('');
  
  const [sortKey, setSortKey] = useState<string>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(25);
  const [selectedTickets, setSelectedTickets] = useState<Set<string>>(new Set());

  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'ALL_TICKETS' | 'NEW_TICKET' | 'FINANCE_BULK_PO' | 'PO_STATUS_DASHBOARD'>(() => {
    const authStore = JSON.parse(localStorage.getItem('auth-storage') || '{}');
    const currentRole = authStore?.state?.role;
    if (currentRole === 'ADMIN1') return 'ALL_TICKETS';
    
    const saved = localStorage.getItem('dashboardActiveTab');
    if (saved === 'MY_TICKETS') return 'ALL_TICKETS';
    return (saved as any) || 'DASHBOARD';
  });
  const [financeSearch, setFinanceSearch] = useState('');
  const [financeAgentFilter, setFinanceAgentFilter] = useState('ALL');
  const [financeProjectFilter, setFinanceProjectFilter] = useState('ALL');
  const [financeShowFullyAssigned, setFinanceShowFullyAssigned] = useState<boolean>(true);
  const [assigningPoForInvoice, setAssigningPoForInvoice] = useState<string | null>(null);
  const [bulkPoNumbers, setBulkPoNumbers] = useState<{ [key: string]: string }>({});
  
  const [showAdminAuthModal, setShowAdminAuthModal] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [bulkProjectPoNumbers, setBulkProjectPoNumbers] = useState<{ [invoiceNumber: string]: { [projectId: string]: string } }>({});
  const [expandedInvoices, setExpandedInvoices] = useState<{ [invoiceNumber: string]: boolean }>({});

  const [allTicketsSubTab, setAllTicketsSubTab] = useState<'SUMMARY' | 'NO_ISSUE' | 'MISSED' | 'UPDATE_REQUIRED' | 'DANGER_ZONE' | 'PAYMENT_DONE' | 'INVOICE_PENDING'>('SUMMARY');
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<'table' | 'cards'>(
    (localStorage.getItem('noIssueViewMode') as any) || 'cards'
  );

  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('dashboardVisibleColumns');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    return {
      passenger_name: true,
      pp_number: true,
      attached_images: true,
      project_id: true,
      route: true,
      ticketing_agency: true,
      approved_cost: true,
      invoice_details: true,
      po_number: true,
      status: true,
      flight_status: true,
      workflow: true
    };
  });

  const [showColumnDropdown, setShowColumnDropdown] = useState(false);
  const [selectedBudgetHealthFilter, setSelectedBudgetHealthFilter] = useState('ALL');

  useEffect(() => {
    localStorage.setItem('dashboardVisibleColumns', JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const getTicketDocuments = (t: any) => {
    const docs: { url: string; label: string; type: 'atbf' | 'invoice_1' | 'invoice_sub' | 'generic'; field?: string; idx?: number }[] = [];
    if (!t) return docs;
    if (t.first_atbf) {
      docs.push({ url: t.first_atbf, label: 'ATBF', type: 'atbf', field: 'first_atbf' });
    }
    if (t.first_invoice) {
      docs.push({ url: t.first_invoice, label: 'Invoice 1', type: 'invoice_1', field: 'first_invoice' });
    }
    if (t.other_invoice) {
      docs.push({ url: t.other_invoice, label: 'Invoice Sub', type: 'invoice_sub', field: 'other_invoice' });
    }
    if (t.attached_images && Array.isArray(t.attached_images)) {
      t.attached_images.forEach((img: string, idx: number) => {
        docs.push({ url: img, label: `Scan ${idx + 1}`, type: 'generic', idx });
      });
    }
    return docs;
  };

  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // For Bulk Finance ERP Entry popup
  const [erpBulkModalData, setErpBulkModalData] = useState<{
    invoice_number: string;
    tickets: any[];
    activeAllocationUnits: { id: string; name: string; type: string }[];
    project_pos: Record<string, string>;
    po_number: string;
  } | null>(null);

  const [erpPoDate, setErpPoDate] = useState<string>('');
  const [erpInvoiceDate, setErpInvoiceDate] = useState<string>('');
  const [erpInvoiceAmounts, setErpInvoiceAmounts] = useState<Record<string, string>>({}); // ticketId -> amount
  const [erpProjectPos, setErpProjectPos] = useState<Record<string, string>>({});
  const [erpPoStatus, setErpPoStatus] = useState<string>('pending po approval');
  const [erpPoRemarks, setErpPoRemarks] = useState<string>('');
  const [erpPaymentDate, setErpPaymentDate] = useState<string>('');
  const [erpPaymentInvoiceNumbers, setErpPaymentInvoiceNumbers] = useState<string>('');
  const [erpTravelAgent, setErpTravelAgent] = useState<string>('');
  const [erpIsAddingNewAgent, setErpIsAddingNewAgent] = useState<boolean>(false);
  const [erpNewAgentName, setErpNewAgentName] = useState<string>('');

  const isSaving = useMemo(() => {
    if (!erpBulkModalData) return false;
    return assigningPoForInvoice === erpBulkModalData.invoice_number;
  }, [assigningPoForInvoice, erpBulkModalData]);

  const pendingFinanceInvoicesCount = useMemo(() => {
    const invoiceGroupsMap: {
      [invoiceNo: string]: {
        invoice_number: string;
        po_number: string;
        tickets: any[];
      };
    } = {};

    tickets.forEach(ticket => {
      if (ticket.first_invoice_number && ticket.first_invoice_number.trim()) {
        const invNo = ticket.first_invoice_number.trim();
        if (!invoiceGroupsMap[invNo]) {
          invoiceGroupsMap[invNo] = {
            invoice_number: invNo,
            po_number: ticket.po_number || '',
            tickets: []
          };
        }
        if (!invoiceGroupsMap[invNo].tickets.some((t: any) => t.id === ticket.id && t.invoice_type === 'first')) {
          invoiceGroupsMap[invNo].tickets.push({
            ...ticket,
            invoice_type: 'first'
          });
        }
      }

      if (ticket.other_invoice_number && ticket.other_invoice_number.trim()) {
        const invNo = ticket.other_invoice_number.trim();
        if (!invoiceGroupsMap[invNo]) {
          invoiceGroupsMap[invNo] = {
            invoice_number: invNo,
            po_number: ticket.po_number || '',
            tickets: []
          };
        }
        if (!invoiceGroupsMap[invNo].tickets.some((t: any) => t.id === ticket.id && t.invoice_type === 'other')) {
          invoiceGroupsMap[invNo].tickets.push({
            ...ticket,
            invoice_type: 'other'
          });
        }
      }
    });

    let pendingInvoicesCount = 0;
    Object.values(invoiceGroupsMap).forEach(group => {
      const subTickets = group.tickets || [];
      const activeAllocationUnits: { id: string; type: 'project' | 'company' }[] = [];

      // Extract unique active project IDs
      const activePids = Array.from(
        new Set(
          subTickets
            .filter((t: any) => {
              const isProj = t.invoice_type === 'other' 
                ? (!t.rescheduled_cost_allocation || t.rescheduled_cost_allocation === 'project') 
                : (!t.cost_allocation || t.cost_allocation === 'project');
              return isProj;
            })
            .flatMap((t: any) => {
              if (Array.isArray(t.project_ids) && t.project_ids.length > 0) {
                return t.project_ids;
              }
              return t.project_id ? [t.project_id] : [];
            })
            .filter(Boolean)
        )
      ) as string[];

      // Extract unique active company names
      const activeCompanies = Array.from(
        new Set(
          subTickets
            .filter((t: any) => {
              const isComp = t.invoice_type === 'other' 
                ? t.rescheduled_cost_allocation === 'company' 
                : t.cost_allocation === 'company';
              return isComp;
            })
            .map((t: any) => t.company || 'Sanken Overseas')
            .filter(Boolean)
        )
      ) as string[];

      activePids.forEach((pid: string) => {
        activeAllocationUnits.push({ id: pid, type: 'project' });
      });
      activeCompanies.forEach((comp: string) => {
        activeAllocationUnits.push({ id: comp, type: 'company' });
      });

      const groupExistingProjectPos: Record<string, string> = {};
      subTickets.forEach((t: any) => {
        const pos = t.invoice_type === 'other' ? t.other_project_pos : t.project_pos;
        if (pos && typeof pos === 'object') {
          Object.assign(groupExistingProjectPos, pos);
        }
      });

      const hasAllPOsAssigned = activeAllocationUnits.length > 0
        ? activeAllocationUnits.every(unit => {
            const po = groupExistingProjectPos[unit.id];
            return po && po.trim() !== '';
          })
        : (group.po_number && group.po_number.trim() !== '');

      if (!hasAllPOsAssigned) {
        pendingInvoicesCount++;
      }
    });

    return pendingInvoicesCount;
  }, [tickets]);

  const pendingPaymentUpdateCount = useMemo(() => {
    return tickets.filter(t => t.po_status !== 'payment done' && t.stage2_completed).length;
  }, [tickets]);

  const invoicePendingCount = useMemo(() => {
    return (tickets || []).filter(t => isInvoicePending(t)).length;
  }, [tickets]);

  const updateRequiredCount = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return (tickets || []).filter(t => {
      if (!t) return false;
      if (role === 'FINANCE') {
        return t.stage2_completed && !t.stage3_completed && t.flight_status !== 'PENDING';
      } else {
        const firstFlightUpdate = (!t.flight_status || t.flight_status === 'PENDING') && 
                        (t.departure_date && t.departure_date < todayStr);
        const secondFlightUpdate = ['NO_SHOW', 'RESCHEDULED', 'CANCELLED'].includes(t.flight_status) &&
                        (!t.rescheduled_flight_status || t.rescheduled_flight_status === 'PENDING') &&
                        (t.rescheduled_departure_date && t.rescheduled_departure_date < todayStr);
        return (firstFlightUpdate || secondFlightUpdate) && !isInvoicePending(t);
      }
    }).length;
  }, [tickets, role]);

  const dashboardTopSummary = useMemo(() => {
    const activeInvoices = new Set<string>();
    const allInvoices = new Set<string>();
    
    let earliestDate: Date | null = null;

    tickets.forEach(ticket => {
      if (ticket.first_invoice_number && ticket.first_invoice_number.trim()) {
        const inv = ticket.first_invoice_number.trim();
        allInvoices.add(inv);
        if (ticket.po_status !== 'payment done') {
          activeInvoices.add(inv);
        }
      }
      if (ticket.other_invoice_number && ticket.other_invoice_number.trim()) {
        const inv = ticket.other_invoice_number.trim();
        allInvoices.add(inv);
        const otherPoStatus = ticket.other_po_status || 'pending po approval';
        if (otherPoStatus !== 'payment done') {
          activeInvoices.add(inv);
        }
      }

      // Track earliest date
      const dateVal = ticket.ticket_arranged_date || ticket.departure_date || ticket.created_at;
      if (dateVal) {
        const d = new Date(dateVal);
        if (!isNaN(d.getTime())) {
          if (!earliestDate || d < earliestDate) {
            earliestDate = d;
          }
        }
      }
    });

    const uniquePassengers = new Set(tickets.map(t => t.passenger_name?.trim()).filter(Boolean));
    const noShowCount = tickets.filter(t => t.flight_status === 'NO_SHOW' || t.rescheduled_flight_status === 'NO_SHOW').length;

    const statusCounts: Record<string, number> = {};
    const flightStatusCounts: Record<string, number> = {};
    tickets.forEach(ticket => {
      const s = ticket.status || 'UNKNOWN';
      statusCounts[s] = (statusCounts[s] || 0) + 1;

      const fs = ticket.flight_status || 'PENDING';
      flightStatusCounts[fs] = (flightStatusCounts[fs] || 0) + 1;
    });

    const updatingSince = earliestDate ? format(earliestDate, 'dd/MM/yyyy') : '31/12/2022';

    return {
      activeInvoicesCount: activeInvoices.size,
      allInvoicesCount: allInvoices.size,
      passengersCount: uniquePassengers.size,
      noShowCount,
      statusCounts,
      flightStatusCounts,
      totalTicketsCount: tickets.length,
      updatingSince
    };
  }, [tickets]);

  const financialSummary = useMemo(() => {
    let invoicePendingUSD = 0;
    let invoicePendingLKR = 0;
    let poPendingUSD = 0;
    let poPendingLKR = 0;
    let invoicePendingCount = 0;
    let poPendingCount = 0;
    
    const invoicePendingByAgent: Record<string, { USD: number; LKR: number; count: number }> = {};
    const poPendingByAgent: Record<string, { USD: number; LKR: number; count: number }> = {};

    (tickets || []).forEach(t => {
      const isLKR = t.currency === 'LKR';
      const agent = (t.travel_agent && String(t.travel_agent).trim()) || 'No Agency';

      let isInvPending = false;
      if (isInvoicePending(t)) {
        const isFirstPending = !t.first_invoice_number || !t.first_invoice_number.trim();
        const isSecondActive = ['NO_SHOW', 'CANCELLED', 'RESCHEDULED'].includes(t.flight_status);
        const isSecondPending = isSecondActive && (!t.other_invoice_number || !t.other_invoice_number.trim());

        let amt = 0;
        if (isFirstPending) {
          amt += Number(t.invoice_amount) || Number(t.approved_rate) || Number(t.price) || 0;
        }
        if (isSecondPending) {
          amt += Number(t.other_invoice_amount) || Number(t.rescheduled_ticket_amount) || Number(t.approved_rate) || Number(t.price) || 0;
        }

        if (amt > 0) {
          isInvPending = true;
          if (!invoicePendingByAgent[agent]) invoicePendingByAgent[agent] = { USD: 0, LKR: 0, count: 0 };
          invoicePendingByAgent[agent].count++;
          if (isLKR) {
            invoicePendingLKR += amt;
            invoicePendingByAgent[agent].LKR += amt;
          } else {
            invoicePendingUSD += amt;
            invoicePendingByAgent[agent].USD += amt;
          }
        }
      }
      if (isInvPending) {
        invoicePendingCount++;
      }

      const isFirstPoPending = t.first_invoice_number && t.first_invoice_number.trim() && t.po_status !== 'payment done';
      const isSecondPoPending = t.other_invoice_number && t.other_invoice_number.trim() && (t.other_po_status || 'pending po approval') !== 'payment done';

      let poAmt = 0;
      if (isFirstPoPending) {
        poAmt += Number(t.invoice_amount) || Number(t.approved_rate) || Number(t.price) || 0;
      }
      if (isSecondPoPending) {
        poAmt += Number(t.other_invoice_amount) || Number(t.rescheduled_ticket_amount) || Number(t.approved_rate) || Number(t.price) || 0;
      }

      if (poAmt > 0) {
        poPendingCount++;
        if (!poPendingByAgent[agent]) poPendingByAgent[agent] = { USD: 0, LKR: 0, count: 0 };
        poPendingByAgent[agent].count++;
        if (isLKR) {
          poPendingLKR += poAmt;
          poPendingByAgent[agent].LKR += poAmt;
        } else {
          poPendingUSD += poAmt;
          poPendingByAgent[agent].USD += poAmt;
        }
      }
    });

    return {
      invoicePendingUSD,
      invoicePendingLKR,
      poPendingUSD,
      poPendingLKR,
      invoicePendingByAgent,
      poPendingByAgent,
      invoicePendingCount,
      poPendingCount
    };
  }, [tickets]);

  const agentAccumulatedStats = useMemo(() => {
    const stats: Record<string, { count: number; cost: number }> = {};
    
    (tickets || []).forEach(t => {
      if (t.travel_agent && String(t.travel_agent).trim()) {
        const agent = String(t.travel_agent).trim();
        if (!stats[agent]) {
          stats[agent] = { count: 0, cost: 0 };
        }
        stats[agent].count += 1;
        stats[agent].cost += Number(t.approved_rate) || Number(t.price) || 0;
      }
      
      if (t.rescheduled_ticket_agent && String(t.rescheduled_ticket_agent).trim()) {
        const rAgent = String(t.rescheduled_ticket_agent).trim();
        if (!stats[rAgent]) {
          stats[rAgent] = { count: 0, cost: 0 };
        }
        stats[rAgent].count += 1;
        stats[rAgent].cost += Number(t.rescheduled_ticket_amount) || 0;
      }
    });

    return Object.entries(stats).map(([agent, data]) => ({
      agent,
      count: data.count,
      cost: data.cost
    })).sort((a, b) => b.cost - a.cost);
  }, [tickets]);

  const monthlyRouteStats = useMemo(() => {
    const monthsData: Record<string, {
      totalCount: number;
      businessCount: number;
      economyCount: number;
      routes: Record<string, {
        business: { USD: { sum: number; count: number }; LKR: { sum: number; count: number } };
        economy: { USD: { sum: number; count: number }; LKR: { sum: number; count: number } };
        all: { USD: { sum: number; count: number }; LKR: { sum: number; count: number } };
      }>;
    }> = {};

    const normalizeRouteStr = (r: string) => {
      if (!r) return '';
      return r.toUpperCase().replace(/\s+/g, '').replace(/->/g, '-').replace(/=>/g, '-').replace(/\//g, '-');
    };

    const targetRouteKeys = ['CMB-MLE', 'CMB-MLE-CMB', 'MLE-CMB', 'MLE-CMB-MLE'];

    (tickets || []).forEach(t => {
      if (!t) return;
      
      const d = t.departure_date || t.ticket_arranged_date || t.created_at || t.stage3_completed_at;
      let monthLabel = 'No Specified Month';
      if (d) {
        try {
          const date = new Date(d);
          if (!isNaN(date.getTime())) {
            monthLabel = date.toLocaleString('default', { month: 'long', year: 'numeric' });
          }
        } catch {
          // ignore
        }
      }

      if (!monthsData[monthLabel]) {
        monthsData[monthLabel] = {
          totalCount: 0,
          businessCount: 0,
          economyCount: 0,
          routes: {}
        };
        // Initialize routes
        targetRouteKeys.forEach(k => {
          monthsData[monthLabel].routes[k] = {
            business: { USD: { sum: 0, count: 0 }, LKR: { sum: 0, count: 0 } },
            economy: { USD: { sum: 0, count: 0 }, LKR: { sum: 0, count: 0 } },
            all: { USD: { sum: 0, count: 0 }, LKR: { sum: 0, count: 0 } }
          };
        });
      }

      const isLKR = t.currency === 'LKR';
      const cost = Number(t.approved_rate) || Number(t.invoice_amount) || Number(t.price) || Number(t.other_invoice_amount) || 0;
      
      const typeStr = String(t.ticket_type || '').toUpperCase();
      const jobStr = String(t.job_category || '').toUpperCase();
      const classStr = String(t.ticket_class || '').toUpperCase();
      const isBusiness = typeStr.includes('BUSINESS') || classStr.includes('BUSINESS') || jobStr.includes('BUSINESS');

      // Update counters
      monthsData[monthLabel].totalCount++;
      if (isBusiness) {
        monthsData[monthLabel].businessCount++;
      } else {
        monthsData[monthLabel].economyCount++;
      }

      const rawRoute = t.route || '';
      const normRoute = normalizeRouteStr(rawRoute);

      if (targetRouteKeys.includes(normRoute)) {
        const routeData = monthsData[monthLabel].routes[normRoute];
        
        if (cost > 0) {
          if (isLKR) {
            routeData.all.LKR.sum += cost;
            routeData.all.LKR.count++;
          } else {
            routeData.all.USD.sum += cost;
            routeData.all.USD.count++;
          }

          if (isBusiness) {
            if (isLKR) {
              routeData.business.LKR.sum += cost;
              routeData.business.LKR.count++;
            } else {
              routeData.business.USD.sum += cost;
              routeData.business.USD.count++;
            }
          } else {
            if (isLKR) {
              routeData.economy.LKR.sum += cost;
              routeData.economy.LKR.count++;
            } else {
              routeData.economy.USD.sum += cost;
              routeData.economy.USD.count++;
            }
          }
        }
      }
    });

    return monthsData;
  }, [tickets]);

  const handleOpenErpPrepModal = (
    invoiceNumber: string,
    passedPo: string,
    project_pos: Record<string, string>,
    tickets: any[],
    activeAllocationUnits: any[]
  ) => {
    const todayStr = new Date().toISOString().split('T')[0];
    
    setErpBulkModalData({
      invoice_number: invoiceNumber,
      tickets,
      activeAllocationUnits,
      project_pos: project_pos || {},
      po_number: passedPo || ''
    });
    
    setErpPoDate(todayStr); // Take same date assigning the PO automatically
    setErpInvoiceDate(todayStr); // Also initialize invoice date to today
    setErpProjectPos(project_pos || {});
    
    const amountsMap: Record<string, string> = {};
    tickets.forEach((t: any) => {
      // Auto-prepopulate with existing amount or approved rate/ticket cost so user doesn't have to re-enter it at all
      const preEnteredAmount = t.invoice_type === 'other'
        ? (t.other_invoice_amount || t.rescheduled_ticket_amount || t.approved_rate || t.price || '')
        : (t.invoice_amount || t.approved_rate || t.price || '');
      amountsMap[t.id] = preEnteredAmount !== undefined && preEnteredAmount !== null ? String(preEnteredAmount) : '';
    });
    setErpInvoiceAmounts(amountsMap);
    setErpPoStatus('pending po approval');
    setErpPoRemarks('');
    setErpPaymentDate(todayStr);
    setErpPaymentInvoiceNumbers('');
    setErpTravelAgent('');
    setErpIsAddingNewAgent(false);
    setErpNewAgentName('');
  };

  const handleAssignBulkPO = async (
    invoiceNumber: string,
    passedPo?: string,
    project_pos?: Record<string, string>,
    poDate?: string,
    invoiceDate?: string,
    invoiceAmounts?: Record<string, string>,
    poStatus?: string,
    poRemarks?: string,
    ticketId?: string
  ) => {
    const poVal = passedPo !== undefined 
      ? passedPo 
      : (bulkPoNumbers[invoiceNumber] !== undefined ? bulkPoNumbers[invoiceNumber] : '');
    setAssigningPoForInvoice(invoiceNumber);
    try {
      if (ticketId) {
        // Individual Ticket Update using Stage 3 Ticket Endpoint!
        await api.put(`/tickets/${ticketId}/stage3`, {
          po_number: poVal,
          project_pos: project_pos || null,
          po_date: poDate || null,
          invoice_date: invoiceDate || null,
          invoice_amount: invoiceAmounts?.[ticketId] !== undefined ? invoiceAmounts[ticketId] : null,
          po_status: poStatus || null,
          po_remarks: poRemarks || null,
          invoice_number: invoiceNumber,
          payment_date: poStatus === 'payment done' ? erpPaymentDate : null,
          payment_invoice_numbers: poStatus === 'payment done' ? erpPaymentInvoiceNumbers : null,
          travel_agent: poStatus === 'payment done' ? erpTravelAgent : null
        });
        toast.success(`Successfully completed ERP Entry for ticket of ${erpBulkModalData?.tickets?.[0]?.passenger_name || 'Passenger'}`);
      } else {
        // Fallback or Bulk Invoice update
        await api.put('/finance/bulk-po', {
          invoice_number: invoiceNumber,
          po_number: poVal,
          project_pos: project_pos || null,
          po_date: poDate || null,
          invoice_date: invoiceDate || null,
          invoice_amounts: invoiceAmounts || null,
          po_status: poStatus || null,
          po_remarks: poRemarks || null,
          payment_date: poStatus === 'payment done' ? erpPaymentDate : null,
          payment_invoice_numbers: poStatus === 'payment done' ? erpPaymentInvoiceNumbers : null,
          travel_agent: poStatus === 'payment done' ? erpTravelAgent : null
        });
        toast.success(`Successfully completed ERP Entry for Invoice '${invoiceNumber}'`);
      }
      setErpBulkModalData(null);
      await fetchData();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to assign PO number');
    } finally {
      setAssigningPoForInvoice(null);
    }
  };

  const handleAddNewPaymentAgent = async () => {
    if (!erpNewAgentName || !erpNewAgentName.trim()) return;
    try {
      const res = await api.post('/options', { category: 'TRAVEL_AGENT', value: erpNewAgentName.trim() });
      const newOpt = res.data;
      setOptions(prev => [...prev, newOpt]);
      setErpTravelAgent(erpNewAgentName.trim());
      setErpIsAddingNewAgent(false);
      setErpNewAgentName('');
      toast.success(`Added and selected agent "${erpNewAgentName.trim()}"`);
    } catch (err: any) {
      toast.error('Failed to add new travel agent');
    }
  };

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [ticketToDelete, setTicketToDelete] = useState<Set<string> | null>(null);

  // ... (existing state)

  const handleDeleteSelected = async () => {
    if (selectedTickets.size === 0) return;
    
    const authStore = JSON.parse(localStorage.getItem('auth-storage') || '{}');
    const currentRole = authStore?.state?.role;
    
    if (currentRole !== 'ADMIN') {
      toast.error("Only Admin can delete tickets");
      return;
    }

    setTicketToDelete(selectedTickets);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!ticketToDelete) return;
    try {
      setLoading(true);
      const deletePromises = Array.from(ticketToDelete).map(id => api.delete(`/tickets/${id}`));
      await Promise.all(deletePromises);
      
      toast.success(`Successfully deleted ${ticketToDelete.size} ticket(s).`);
      setSelectedTickets(new Set());
      await fetchData();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to delete tickets.');
      setLoading(false);
    } finally {
      setLoading(false);
      setTicketToDelete(null);
    }
  };

  const handleDownloadFile = async (url: string, filename: string) => {
    if (!url) {
      toast.error('File URL is missing or invalid.');
      return;
    }
    const downloadToast = toast.loading('Preparing file download...');
    try {
      const response = await fetch(url, { referrerPolicy: 'no-referrer' });
      if (!response.ok) throw new Error('Dynamic download response non-ok');
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      toast.success('Download started!', { id: downloadToast });
    } catch (error) {
      try {
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Opening direct link...', { id: downloadToast });
      } catch (err) {
        toast.error('Could not download. Please right-click inside the viewer.', { id: downloadToast });
      }
    }
  };

  const [uploadTicketId, setUploadTicketId] = useState<string | null>(null);

  const handleImageUpload = async (ticketId: string, base64Data: string) => {
    try {
      const ticket = tickets.find(t => t.id === ticketId);
      if (!ticket) return;
      const currentImages = ticket.attached_images || [];
      const updatedImages = [...currentImages, base64Data];
      
      await api.put(`/tickets/${ticketId}`, { ...ticket, attached_images: updatedImages });
      toast.success('Document scan attached');
      setUploadTicketId(null);
      fetchData();
    } catch (e) {
      toast.error('Failed to attach document');
    }
  };

  const handleImageDelete = async (ticketId: string, indexToDelete: number) => {
    if (!window.confirm('Delete this attached document scan?')) return;
    try {
      const ticket = tickets.find(t => t.id === ticketId);
      if (!ticket) return;
      const currentImages = ticket.attached_images || [];
      const updatedImages = currentImages.filter((_: any, i: number) => i !== indexToDelete);
      
      await api.put(`/tickets/${ticketId}`, { ...ticket, attached_images: updatedImages });
      toast.success('Document scan removed');
      fetchData();
    } catch (e) {
      toast.error('Failed to remove document');
    }
  };

  const handleSetCostAllocation = async (ticketId: string, allocation: 'project' | 'company', invoiceType?: 'first' | 'other') => {
    const updatingToast = toast.loading('Updating cost allocation...');
    try {
      const ticket = tickets.find(t => t.id === ticketId);
      if (!ticket) {
        toast.error('Ticket not found', { id: updatingToast });
        return;
      }
      
      const updatedValues: any = { ...ticket };
      if (invoiceType === 'other') {
        updatedValues.rescheduled_cost_allocation = allocation;
      } else {
        updatedValues.cost_allocation = allocation;
      }
      
      await api.put(`/tickets/${ticketId}`, updatedValues);
      toast.success(`Cost allocated to ${allocation === 'project' ? 'Project' : 'Re; company'}`, { id: updatingToast });
      fetchData();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to update cost allocation', { id: updatingToast });
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const fetchProjects = async () => {
    if (!token) return;
    try {
      const res = await api.get('/projects');
      setAllProjects(Array.isArray(res.data) ? res.data : []);
    } catch (e: any) {
      if (e.response?.status !== 401) {
        console.warn('Failed to load projects list');
      }
    }
  };

  const fetchRemainingTicketsInBatches = async (startOffset: number, total: number, fetchId: number) => {
    let currentOffset = startOffset;
    const batchSize = 200;
    while (currentOffset < total) {
      if (fetchId !== fetchIdRef.current) return;
      try {
        const res = await api.get(`/tickets?limit=${batchSize}&offset=${currentOffset}`);
        if (fetchId !== fetchIdRef.current) return;
        const newTickets = res.data?.tickets || [];
        if (newTickets.length === 0) break;
        
        setTickets(prev => {
          if (fetchId !== fetchIdRef.current) return prev;
          const existingIds = new Set(prev.map(tk => tk.id));
          const filtered = newTickets.filter((tk: any) => !existingIds.has(tk.id));
          const merged = [...prev, ...filtered];
          setSyncedCount(merged.length);
          return merged;
        });
        
        currentOffset += batchSize;
      } catch (err) {
        console.error("Error fetching ticket batch:", err);
        break;
      }
    }
    if (fetchId === fetchIdRef.current) {
      setBackgroundSyncing(false);
    }
  };

  const fetchData = async () => {
    if (!token) return;
    const currentFetchId = ++fetchIdRef.current;
    try {
      const [m, f, p, t, o] = await Promise.all([
        api.get('/dashboard/metrics'),
        api.get('/dashboard/flight-status'),
        api.get('/dashboard/project-costs'),
        api.get('/tickets?limit=100&offset=0'),
        api.get('/options')
      ]);
      
      if (currentFetchId !== fetchIdRef.current) return;
      
      setMetrics(m?.data || null);
      setFlightStatus(f?.data || {});
      const projData = (p?.data?.projects || []).filter((proj: any) => proj.budget > 0 || proj.spent > 0 || proj.pending > 0);
      setProjects(projData);
      setCompanies(p?.data?.companies || []);
      
      const firstBatch = t?.data?.tickets || [];
      setTickets(firstBatch);
      setOptions(o?.data || []);
      
      const totalTickets = t?.data?.total || 0;
      setTotalCount(totalTickets);
      setSyncedCount(firstBatch.length);
      
      if (totalTickets > firstBatch.length) {
        setBackgroundSyncing(true);
        fetchRemainingTicketsInBatches(firstBatch.length, totalTickets, currentFetchId);
      } else {
        setBackgroundSyncing(false);
      }
    } catch (error: any) {
      if (error.response?.status !== 401) {
        toast.error(error.response?.data?.detail || 'Failed to load dashboard data');
      }
    } finally {
      if (currentFetchId === fetchIdRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (role === 'ADMIN1') {
      setActiveTab('ALL_TICKETS');
    }
  }, [role]);

  useEffect(() => {
    localStorage.setItem('dashboardActiveTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (role === 'SADMIN') return;
    fetchData();
    fetchProjects();
  }, [role]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, agentFilter, ticketTypeFilter, activeTab, allTicketsSubTab, dateFrom, dateTo]);

  const subcontractorEntitlementsData = React.useMemo(() => {
    const list: {
      projectId: string;
      projectName: string;
      company: string;
      initial: number;
      applied: number;
      remaining: number;
      cycle: 'MONTHLY' | 'PROJECT_PERIOD';
      duration: number;
      startDate: string;
      isExpired: boolean;
      expirationWarningStr: string;
    }[] = [];

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    (allProjects || []).forEach((proj: any) => {
      const companyEnts = proj.company_entitlements || {};
      const cycles = proj.company_entitlement_cycles || {};
      const periods = proj.company_entitlement_periods || {};
      const starts = proj.company_entitlement_starts || {};
      
      const activeCompanies = Object.entries(companyEnts)
        .filter(([_, val]) => {
          const v = parseInt(String(val)) || 0;
          return v > 0;
        })
        .map(([compName, val]) => ({
          company: compName,
          initial: parseInt(String(val)) || 0
        }));

      if (activeCompanies.length === 0 && (parseInt(proj.entitlement_total) || 0) > 0) {
        activeCompanies.push({
          company: proj.company || 'Unspecified Re; company',
          initial: parseInt(proj.entitlement_total) || 0
        });
      }

      activeCompanies.forEach(({ company, initial }) => {
        const cycle = cycles[company] || 'PROJECT_PERIOD';
        const duration = parseInt(String(periods[company] || '12')) || 12;
        const startDate = starts[company] || '';

        const appliedCount = (tickets || []).filter((t: any) => {
          const isApplied = !!t.subcontractor_entitlement_applied;
          const matchesProject = t.project_id === proj.id || (Array.isArray(t.project_ids) && t.project_ids.includes(proj.id));
          const matchesCompany = String(t.company || '').trim().toLowerCase() === company.trim().toLowerCase();
          if (!isApplied || !matchesProject || !matchesCompany) return false;

          if (cycle === 'MONTHLY') {
            const dateStr = t.ticket_arranged_date || t.created_at || t.departure_date;
            if (!dateStr) return false;
            try {
              const d = new Date(dateStr);
              if (isNaN(d.getTime())) return false;
              return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
            } catch {
              return false;
            }
          }
          return true;
        }).length;

        const remaining = initial - appliedCount;

        let isExpired = false;
        let expirationWarningStr = '';
        if (cycle === 'PROJECT_PERIOD' && startDate) {
          try {
            const start = new Date(startDate);
            if (!isNaN(start.getTime())) {
              const expiryDate = new Date(start);
              expiryDate.setMonth(expiryDate.getMonth() + duration);
              if (now > expiryDate) {
                isExpired = true;
                expirationWarningStr = `Expired on ${expiryDate.toISOString().split('T')[0]}`;
              } else {
                expirationWarningStr = `Expires on ${expiryDate.toISOString().split('T')[0]}`;
              }
            }
          } catch (err) {
            console.error("Error evaluating expiry:", err);
          }
        }

        list.push({
          projectId: proj.id,
          projectName: proj.name,
          company,
          initial,
          applied: appliedCount,
          remaining,
          cycle,
          duration,
          startDate,
          isExpired,
          expirationWarningStr
        });
      });
    });

    return list.sort((a, b) => a.projectName.localeCompare(b.projectName));
  }, [allProjects, tickets]);

  const filteredEntitlements = React.useMemo(() => {
    if (!entitlementSearch.trim()) return subcontractorEntitlementsData;
    const q = entitlementSearch.toLowerCase().trim();
    return subcontractorEntitlementsData.filter(item => 
      item.projectName.toLowerCase().includes(q) ||
      item.company.toLowerCase().includes(q)
    );
  }, [subcontractorEntitlementsData, entitlementSearch]);

  if (role === 'SADMIN' || role === 'MANAGER') {
    return <Navigate to="/sadmin" replace />;
  }


  if (loading) return (
    <div className="min-h-screen bg-slate-50 px-4 sm:px-6 lg:px-8 py-8 max-w-7xl mx-auto">
      <div className="flex justify-end mb-4">
        <div className="h-8 w-28 bg-slate-200 rounded animate-pulse" />
      </div>
      <div className="h-10 w-64 bg-slate-200 rounded mb-6 animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
        {[1,2,3,4,5].map(i => <div key={i} className="bg-white rounded-xl border border-slate-200 p-6 h-32 animate-pulse" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 h-64 animate-pulse" />
        <div className="bg-white rounded-xl border border-slate-200 h-64 animate-pulse lg:col-span-2" />
      </div>
    </div>
  );

  const COLORS = ['#00D9FF', '#10B981', '#EF4444', '#F59E0B', '#8B5CF6'];
  const flightData = Object.entries(flightStatus || {}).map(([name, value]) => ({ name, value }));

  const filteredTickets = (tickets || []).filter(t => {
    if (!t) return false;
    const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
    const matchesAgent = agentFilter === 'ALL' || t.travel_agent === agentFilter;
    const matchesType = ticketTypeFilter === 'ALL' || t.ticket_type === ticketTypeFilter;
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || [
      t.pp_number,
      t.passenger_name,
      t.company,
      t.route,
      t.travel_agent,
      t.po_number,
      t.invoice_number,
      t.job_category,
      allProjects.find(p => p.id === t.project_id)?.name,
    ].some(f => (f || '').toString().toLowerCase().includes(q));
    const matchesTab = true;
    
    let matchesSubTab = true;
    if (activeTab === 'ALL_TICKETS') {
      if (allTicketsSubTab === 'NO_ISSUE') {
        matchesSubTab = t.flight_status === 'DEPARTED' && !isInvoicePending(t);
      } else if (allTicketsSubTab === 'MISSED') {
        // Appears here after the first NO_SHOW, and also after second NO_SHOW
        matchesSubTab = (t.flight_status === 'NO_SHOW' || t.rescheduled_flight_status === 'NO_SHOW' ||
                        (['RESCHEDULED', 'CANCELLED'].includes(t.flight_status) && t.rescheduled_flight_status === 'DEPARTED')) && !isInvoicePending(t);
      } else if (allTicketsSubTab === 'UPDATE_REQUIRED') {
        if (role === 'FINANCE') {
          matchesSubTab = t.stage2_completed && !t.stage3_completed && t.flight_status !== 'PENDING';
        } else {
          const firstFlightUpdate = (!t.flight_status || t.flight_status === 'PENDING') && 
                          (t.departure_date && t.departure_date < format(new Date(), 'yyyy-MM-dd'));
          const secondFlightUpdate = ['NO_SHOW', 'RESCHEDULED', 'CANCELLED'].includes(t.flight_status) &&
                          (!t.rescheduled_flight_status || t.rescheduled_flight_status === 'PENDING') &&
                          (t.rescheduled_departure_date && t.rescheduled_departure_date < format(new Date(), 'yyyy-MM-dd'));
          matchesSubTab = (firstFlightUpdate || secondFlightUpdate) && !isInvoicePending(t);
        }
      } else if (allTicketsSubTab === 'DANGER_ZONE') {
        // Appears here only if both initial and rescheduled flight statuses are NO_SHOW (second no-show)
        matchesSubTab = t.flight_status === 'NO_SHOW' && t.rescheduled_flight_status === 'NO_SHOW' && !isInvoicePending(t);
      } else if (allTicketsSubTab === 'PAYMENT_DONE') {
        matchesSubTab = t.po_status === 'payment done';
      } else if (allTicketsSubTab === 'INVOICE_PENDING') {
        matchesSubTab = isInvoicePending(t);
      } else {
        // SUMMARY (Air ticket summary sheet) contains all tickets including no-shows, rescheduled, cancelled
        matchesSubTab = !isInvoicePending(t);
      }
    }
    
    const matchesDate = (!dateFrom || (t.departure_date && t.departure_date >= dateFrom)) &&
                        (!dateTo   || (t.departure_date && t.departure_date <= dateTo));

    return matchesStatus && matchesSearch && matchesTab && matchesSubTab && matchesAgent && matchesType && matchesDate;
  });

  const sortedTickets = [...filteredTickets].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const totalPages = Math.max(1, Math.ceil(sortedTickets.length / pageSize));
  const pagedTickets = sortedTickets.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleExportCSV = () => {
    const rows = [];
    
    if (activeTab === 'ALL_TICKETS' && (allTicketsSubTab === 'MISSED' || allTicketsSubTab === 'DANGER_ZONE')) {
      rows.push("Date of first scheduled flight,Project,Name,Passport Number,Designation,Company,Date (1st ticket) ISSUED,1st ticket amount,Agent,Date (2nd ticket) ISSUED,2nd ticket amount,Agent,Scheduled & Gone,2nd Flight Status");
      
      const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        try { return format(new Date(dateStr), 'dd.MM.yyyy'); } catch (e) { return dateStr; }
      };

      sortedTickets.forEach((t) => {
        const proj = allProjects.find(p => p.id === t.project_id);
        const projName = proj ? proj.name : t.project_id;

        const row = [
          formatDate(t.departure_date),
          projName || '',
          t.passenger_name || '',
          t.pp_number || '',
          t.job_category || '',
          t.company || '',
          formatDate(t.ticket_arranged_date),
          t.approved_rate ? t.approved_rate.toString() : '',
          t.travel_agent || '',
          formatDate(t.rescheduled_ticket_date),
          t.rescheduled_ticket_amount ? t.rescheduled_ticket_amount.toString() : '',
          t.rescheduled_ticket_agent || '',
          t.rescheduled_departure_date ? formatDate(t.rescheduled_departure_date) : (t.flight_status || ''),
          t.rescheduled_flight_status || ''
        ];

        const csvRow = row.map(cell => {
          const cellStr = String(cell);
          if (cellStr.includes(',') || cellStr.includes('\"')) {
            return `"${cellStr.replace(/"/g, '""')}"`;
          }
          return cellStr;
        }).join(',');

        rows.push(csvRow);
      });
      
      const csvContent = rows.join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `Passengers_Missed_Flights_${format(new Date(), 'yyyy-MM-dd')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    const selectedProject = 'ALL';
    const selectedProjectInfo = selectedProject && selectedProject !== 'ALL' ? allProjects.find(p => p.id === selectedProject) : null;

    rows.push(",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,");
    rows.push(", Sanken Overseas (Pvt) Ltd,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,");
    rows.push(",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,");
    rows.push(", F-ADM-002-ATSS  I  Revision No : 00  |  Issued Date: 31/12/2022,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,");
    rows.push(",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,");
    rows.push(",Air Ticket Summary Sheet,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,");
    rows.push(",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,");
    rows.push(`,Project,${selectedProjectInfo ? selectedProjectInfo.name : 'ALL'},,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,`);
    rows.push(`,Project Country,${selectedProjectInfo ? (selectedProjectInfo.country || '') : ''},,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,`);
    rows.push(`,Project Company,${selectedProjectInfo ? (selectedProjectInfo.company || '') : ''},,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,`);
    rows.push(",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,");
    rows.push(",Item,PP number,Passenger Name,Job Category as per visa,Ticket Type (Economy/ Business),Ticket Arranged Date,Departure date,Arrival Date        (if return ticket is arranged),Company,Project,Travel agent,Route,Currency, Approved rate ,PO Number,Invoice Number,Invoice Amount without Tax,Payment Released Date,,,,,,,,,,,,,,,,,,,,,,,");

    sortedTickets.forEach((t, i) => {
      const proj = allProjects.find(p => p.id === t.project_id);
      const projName = proj ? proj.name : t.project_id;

      const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        try { return format(new Date(dateStr), 'dd.MM.yyyy'); } catch (e) { return dateStr; }
      };

      const row = [
        "", 
        i + 1,
        t.pp_number || '',
        t.passenger_name || '',
        t.job_category || '',
        t.ticket_type || '',
        formatDate(t.ticket_arranged_date),
        formatDate(t.departure_date),
        t.arrival_date ? formatDate(t.arrival_date) : 'N/A',
        t.company || '',
        projName || '',
        t.travel_agent || '',
        t.route || '',
        t.currency || '',
        t.approved_rate ? t.approved_rate.toFixed(2) : '',
        t.po_number || '',
        t.invoice_number || '',
        t.invoice_amount ? t.invoice_amount.toFixed(2) : '',
        formatDate(t.stage3_completed_at)
      ];
      
      const csvRow = row.map(cell => {
         const cellStr = String(cell);
         if (cellStr.includes(',') || cellStr.includes('\"')) {
            return `"${cellStr.replace(/"/g, '""')}"`;
         }
         return cellStr;
      }).join(',');

      rows.push(csvRow + ",,,,,,,,,,,,,,,,,,,,,,,");
    });
    
    const csvContent = rows.join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Air_Ticket_Summary_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getFilteredOptions = (category: string) => (Array.isArray(options) ? options.filter(o => o.category === category) : []);
  
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-12">
      <main className="max-w-[200rem] mx-auto px-4 sm:px-6 lg:px-8 py-8" id="main-content">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
            {backgroundSyncing && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-100 shadow-xs">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
                </span>
                Syncing tickets ({syncedCount} / {totalCount})
              </span>
            )}
          </div>
          <button 
            onClick={() => { fetchData(); fetchProjects(); }}
            type="button"
            className="text-sm border border-slate-300 font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 rounded px-3 py-1.5 shadow-sm bg-white"
            aria-label="Refresh dashboard data"
          >
            Refresh Data
          </button>
        </div>

        {/* Dashboard Operational Intelligence Hub */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          
          {/* Column 1: Workflow Status Tracker */}
          <motion.div 
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.4 }}
            className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col h-full min-h-[220px]"
          >
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-[12px] font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse"></span>
                  Workflow Status
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Real-time pipeline orchestration.</p>
              </div>
              <span className="text-[10px] font-semibold text-emerald-600 uppercase tracking-widest bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                Live
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-2 flex-1">
              {Object.entries(dashboardTopSummary.statusCounts).map(([status, count]) => {
                const label = status.replace(/_/g, ' ');
                const isCompleted = status === 'COMPLETED';
                const isProgress = status === 'IN_PROGRESS';
                
                return (
                  <motion.div
                    key={status}
                    whileHover={{ scale: 1.02 }}
                    className="flex flex-col justify-center bg-slate-50/60 border border-slate-200/60 hover:border-sky-300 p-3 rounded-xl transition-all text-left cursor-pointer"
                  >
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1" title={label}>
                      {label}
                    </span>
                    <span className="text-2xl font-black text-slate-800 leading-none">
                      {count as React.ReactNode}
                    </span>
                  </motion.div>
                );
              })}
            </div>
            <div className="border-t border-slate-100 pt-3 mt-4 text-[10px] text-slate-400 flex items-center gap-2">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400"></span>
              Real-time sync across pipeline stages
            </div>
          </motion.div>

          {/* Column 2: Ticketing Agents */}
          <motion.div 
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.4, delay: 0.1 }}
            className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col h-full min-h-[220px]"
          >
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-[12px] font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-500" />
                  Ticketing Agents
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Performance & volume overview.</p>
              </div>
            </div>
            
            <div className="space-y-2 flex-1 overflow-y-auto">
              {agentAccumulatedStats.map(({ agent, count, cost }, idx) => (
                <div 
                  key={`${agent}-${idx}`}
                  className="flex items-center justify-between bg-slate-50 border border-slate-100 p-3 rounded-xl"
                >
                  <span className="text-sm font-bold text-slate-700 truncate" title={agent}>{agent}</span>
                  <div className="text-right">
                    <span className="text-xs font-black text-slate-900 block">{count} Tickets</span>
                    <span className="text-[10px] font-bold text-emerald-600">${cost.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Column 3: Refresh and Metrics Overview */}
          <div className="flex flex-col gap-6">
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => { fetchData(); fetchProjects(); }}
              type="button"
              className="w-full flex items-center justify-center gap-2 text-sm border border-sky-200 font-bold text-sky-700 hover:bg-sky-50 transition-all rounded-xl px-4 py-3 shadow-sm bg-sky-50/50"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh Dashboard Data
            </motion.button>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 gap-2 flex-1">
              {/* Processed */}
              <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-2.5 flex flex-col justify-center min-h-[75px]">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Processed</span>
                <span className="text-lg font-black text-slate-800 leading-none">{dashboardTopSummary.totalTicketsCount}</span>
              </div>

              {/* Invoices */}
              <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-2.5 flex flex-col justify-center min-h-[75px]">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Invoices</span>
                <span className="text-lg font-black text-slate-800 leading-none">{dashboardTopSummary.activeInvoicesCount}</span>
              </div>

              {/* Passengers */}
              <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-2.5 flex flex-col justify-center min-h-[75px]">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Passengers</span>
                <span className="text-lg font-black text-slate-800 leading-none">{dashboardTopSummary.passengersCount}</span>
              </div>

              {/* No Shows */}
              <motion.div 
                initial={false}
                animate={dashboardTopSummary.noShowCount > 0 ? { borderColor: '#fecaca' } : { borderColor: '#e2e8f0' }}
                className={`bg-white rounded-xl shadow-xs border p-2.5 flex flex-col justify-center min-h-[75px] ${dashboardTopSummary.noShowCount > 0 ? 'bg-red-50/20' : ''}`}
              >
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">No Shows</span>
                <span className={`text-lg font-black ${dashboardTopSummary.noShowCount > 0 ? 'text-red-600' : 'text-slate-800'} leading-none`}>{dashboardTopSummary.noShowCount}</span>
              </motion.div>

              {/* Invoice Pending */}
              <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-2.5 flex flex-col justify-between min-h-[115px] col-span-1">
                <div>
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Invoice Pending</span>
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.25 rounded-full leading-none">
                      {financialSummary.invoicePendingCount}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {financialSummary.invoicePendingUSD > 0 && (
                      <span className="text-sm font-extrabold text-slate-800 leading-none">
                        ${financialSummary.invoicePendingUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    )}
                    {financialSummary.invoicePendingLKR > 0 && (
                      <span className="text-xs font-bold text-slate-600 leading-none">
                        LKR {financialSummary.invoicePendingLKR.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    )}
                    {financialSummary.invoicePendingUSD === 0 && financialSummary.invoicePendingLKR === 0 && (
                      <span className="text-xs font-bold text-slate-400 leading-none">None</span>
                    )}
                  </div>
                </div>

                {Object.entries(financialSummary.invoicePendingByAgent).length > 0 && (
                  <div className="mt-1.5 pt-1.5 border-t border-slate-100 flex flex-col gap-0.5 max-h-[50px] overflow-y-auto scrollbar-thin">
                    {Object.entries(financialSummary.invoicePendingByAgent).map(([agent, val], idx) => {
                      const amt = val as { USD: number; LKR: number; count: number };
                      const hasUSD = amt.USD > 0;
                      const hasLKR = amt.LKR > 0;
                      if (!hasUSD && !hasLKR) return null;
                      return (
                        <div key={`${agent}-${idx}`} className="flex justify-between items-center text-[8px] leading-tight text-slate-500 font-medium truncate">
                          <span className="truncate max-w-[65px]" title={agent}>
                            {agent} <span className="text-[7px] text-slate-400 font-bold font-mono">({amt.count})</span>
                          </span>
                          <span className="font-semibold text-slate-700 shrink-0">
                            {hasUSD && `$${Math.round(amt.USD).toLocaleString()}`}
                            {hasUSD && hasLKR && ' / '}
                            {hasLKR && `${Math.round(amt.LKR / 1000).toLocaleString()}K`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* PO Pending */}
              <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-2.5 flex flex-col justify-between min-h-[115px] col-span-1">
                <div>
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">PO Pending</span>
                    <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.25 rounded-full leading-none border border-amber-100 animate-pulse-slow">
                      {financialSummary.poPendingCount}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {financialSummary.poPendingUSD > 0 && (
                      <span className="text-sm font-extrabold text-amber-600 leading-none">
                        ${financialSummary.poPendingUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    )}
                    {financialSummary.poPendingLKR > 0 && (
                      <span className="text-xs font-bold text-amber-500 leading-none">
                        LKR {financialSummary.poPendingLKR.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    )}
                    {financialSummary.poPendingUSD === 0 && financialSummary.poPendingLKR === 0 && (
                      <span className="text-xs font-bold text-slate-400 leading-none">None</span>
                    )}
                  </div>
                </div>

                {Object.entries(financialSummary.poPendingByAgent).length > 0 && (
                  <div className="mt-1.5 pt-1.5 border-t border-slate-100 flex flex-col gap-0.5 max-h-[50px] overflow-y-auto scrollbar-thin">
                    {Object.entries(financialSummary.poPendingByAgent).map(([agent, val], idx) => {
                      const amt = val as { USD: number; LKR: number; count: number };
                      const hasUSD = amt.USD > 0;
                      const hasLKR = amt.LKR > 0;
                      if (!hasUSD && !hasLKR) return null;
                      return (
                        <div key={`${agent}-${idx}`} className="flex justify-between items-center text-[8px] leading-tight text-slate-500 font-medium truncate">
                          <span className="truncate max-w-[65px]" title={agent}>
                            {agent} <span className="text-[7px] text-amber-400 font-bold font-mono">({amt.count})</span>
                          </span>
                          <span className="font-semibold text-amber-600 shrink-0">
                            {hasUSD && `$${Math.round(amt.USD).toLocaleString()}`}
                            {hasUSD && hasLKR && ' / '}
                            {hasLKR && `${Math.round(amt.LKR / 1000).toLocaleString()}K`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
        
        {/* Tabs */}
        <div className="border-b border-slate-200 mb-6 overflow-x-auto hide-scrollbar">
          <nav className="-mb-px flex space-x-6 min-w-max px-1" aria-label="Main navigation" role="tablist">
            <button
              id="tab-dashboard"
              role="tab"
              aria-selected={activeTab === 'DASHBOARD'}
              aria-controls="panel-dashboard"
              onClick={() => setActiveTab('DASHBOARD')}
              className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 rounded-t-sm ${activeTab === 'DASHBOARD' ? 'border-sky-500 text-sky-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
            >
              Dashboard
            </button>
            {(role === 'ADMIN1' || role === 'ADMIN') && (
              <button
                id="tab-all-tickets"
                role="tab"
                aria-selected={activeTab === 'ALL_TICKETS'}
                aria-controls="panel-all-tickets"
                onClick={() => setActiveTab('ALL_TICKETS')}
                className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 rounded-t-sm ${activeTab === 'ALL_TICKETS' ? 'border-sky-500 text-sky-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
              >
                All Tickets
              </button>
            )}
            {role !== 'FINANCE' && (
              <button
                id="tab-new-ticket"
                role="tab"
                aria-selected={activeTab === 'NEW_TICKET'}
                aria-controls="panel-new-ticket"
                onClick={() => setActiveTab('NEW_TICKET')}
                className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 rounded-t-sm ${activeTab === 'NEW_TICKET' ? 'border-sky-500 text-sky-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
              >
                New Ticket
              </button>
            )}
            {role === 'FINANCE' && (() => {
              const displayCount = pendingFinanceInvoicesCount;
              return (
                <button
                  id="tab-finance-bulk-po"
                  role="tab"
                  aria-selected={activeTab === 'FINANCE_BULK_PO'}
                  aria-controls="panel-finance-bulk-po"
                  onClick={() => setActiveTab('FINANCE_BULK_PO')}
                  className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center focus:outline-none focus:ring-2 focus:ring-sky-500 rounded-t-sm ${activeTab === 'FINANCE_BULK_PO' ? 'border-sky-500 text-sky-500' : 'border-transparent text-slate-500 hover:text-slate-705 hover:border-slate-350'}`}
                >
                  Invoice and PO management
                  {displayCount > 0 && (
                    <span className="ml-2 inline-flex items-center justify-center bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] h-5">
                      {displayCount}
                    </span>
                  )}
                </button>
              );
            })()}
            {['ADMIN', 'ADMIN1'].includes(role) && (() => {
              const displayCount = pendingPaymentUpdateCount;
              return (
                <button
                  id="tab-po-status-dashboard"
                  role="tab"
                  aria-selected={activeTab === 'PO_STATUS_DASHBOARD'}
                  aria-controls="panel-po-status-dashboard"
                  onClick={() => setActiveTab('PO_STATUS_DASHBOARD')}
                  className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center focus:outline-none focus:ring-2 focus:ring-sky-500 rounded-t-sm ${activeTab === 'PO_STATUS_DASHBOARD' ? 'border-sky-500 text-sky-500' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-350'}`}
                >
                  Payment Update
                  {displayCount > 0 && (
                    <span className="ml-2 inline-flex items-center justify-center bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[20px] h-5">
                      {displayCount}
                    </span>
                  )}
                </button>
              );
            })()}
          </nav>
        </div>

        {activeTab === 'DASHBOARD' && role !== 'MANAGER' && (
          <>
            {/* KPI Cards */}
            {metrics && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-5 mb-8">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col items-start hover:border-slate-300 transition-all duration-300 relative overflow-hidden">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Total Tickets</span>
                  <span className="text-4xl font-extrabold text-slate-900 mt-2 tracking-tight">{metrics.total_tickets}</span>
                </div>
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col items-start hover:border-slate-300 transition-all duration-300 relative overflow-hidden">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Processed & Paid</span>
                  <span className="text-4xl font-extrabold text-emerald-600 mt-2 tracking-tight">{metrics.processed_tickets}</span>
                </div>
                <div 
                  onClick={() => { setActiveTab('ALL_TICKETS'); setAllTicketsSubTab('MISSED'); }} 
                  className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col items-start hover:border-red-300 cursor-pointer transition-all duration-300 relative overflow-hidden group"
                  title="Click to view all missed flights"
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[11px] font-bold text-red-600 uppercase tracking-widest">No-Shows</span>
                    {metrics.no_show_count > 0 && (
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600"></span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-end justify-between w-full mt-2">
                    <span className="text-4xl font-extrabold text-red-600 tracking-tight">{metrics.no_show_count}</span>
                  </div>
                </div>
                <div onClick={() => {
                  if (role === 'FINANCE') {
                    setActiveTab('FINANCE_BULK_PO');
                  } else {
                    setActiveTab('ALL_TICKETS');
                    setAllTicketsSubTab('UPDATE_REQUIRED');
                  }
                }} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col items-start cursor-pointer hover:border-orange-300 transition-all duration-300 relative overflow-hidden">
                  <span className="text-[11px] font-bold text-orange-600 uppercase tracking-widest">Update Required</span>
                  <span className="text-4xl font-extrabold text-slate-900 mt-2 tracking-tight">{updateRequiredCount || 0}</span>
                </div>
                <div onClick={() => {
                  if (role === 'FINANCE') {
                    setActiveTab('FINANCE_BULK_PO');
                  } else {
                    setActiveTab('ALL_TICKETS');
                    setAllTicketsSubTab('INVOICE_PENDING');
                  }
                }} className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl shadow border border-amber-200 p-6 flex flex-col items-start cursor-pointer hover:shadow-md transition-shadow relative overflow-hidden">
                  <div className="absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 bg-amber-200/30 rounded-full opacity-50 pointer-events-none"></div>
                  <span className="text-sm font-semibold text-amber-800 uppercase tracking-wider">Invoice Pending</span>
                  <span className="text-4xl font-extrabold text-amber-600 mt-2 tracking-tight">{invoicePendingCount || 0}</span>
                </div>
                <div className="bg-gradient-to-br from-sky-50 to-sky-100/50 rounded-xl shadow border border-sky-100 p-6 flex flex-col items-start hover:shadow-md transition-shadow relative overflow-hidden">
                  <div className="absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 bg-sky-200/30 rounded-full opacity-50 pointer-events-none"></div>
                  <span className="text-sm font-semibold text-sky-800 uppercase tracking-wider">Total Paid (USD)</span>
                  <span className="text-4xl font-extrabold text-sky-700 mt-2 tracking-tight">${(metrics.total_cost || 0).toLocaleString()}</span>
                  {metrics.total_pending > 0 && (
                    <span className="text-xs text-slate-500 mt-1">+ ${metrics.total_pending.toLocaleString()} pending</span>
                  )}
                </div>
              </div>
            )}

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 lg:col-span-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2">
                    <h3 className="text-sm font-black uppercase tracking-wider text-slate-700">Status Distribution</h3>
                    <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 shrink-0 select-none">
                      <button 
                        type="button"
                        onClick={() => setDonutType('FLIGHT')}
                        className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded transition-all ${
                          donutType === 'FLIGHT' 
                            ? 'bg-white text-slate-800 shadow-3xs' 
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Flight
                      </button>
                      <button 
                        type="button"
                        onClick={() => setDonutType('WORKFLOW')}
                        className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded transition-all ${
                          donutType === 'WORKFLOW' 
                            ? 'bg-white text-slate-800 shadow-3xs' 
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Workflow
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-center py-2">
                    {donutType === 'FLIGHT' ? (
                      dashboardTopSummary.flightStatusCounts ? (
                        <DonutChart data={dashboardTopSummary.flightStatusCounts as Record<string, number>} colors={{
                          'PENDING': '#64748b',
                          'DEPARTED': '#10b981',
                          'NO_SHOW': '#ef4444',
                          'RESCHEDULED': '#f59e0b',
                          'CANCELLED': '#ec4899'
                        }} />
                      ) : (
                        <div className="flex items-center justify-center h-48 text-slate-400 text-xs font-semibold">No flight data available</div>
                      )
                    ) : (
                      dashboardTopSummary.statusCounts ? (
                        <DonutChart data={dashboardTopSummary.statusCounts as Record<string, number>} colors={{
                          'COMPLETED': '#10b981',
                          'DRAFT': '#94a3b8',
                          'IN_PROGRESS': '#3b82f6'
                        }} />
                      ) : (
                        <div className="flex items-center justify-center h-48 text-slate-400 text-xs font-semibold">No workflow data available</div>
                      )
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 lg:col-span-2">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Project Ticket Costs</h3>
                <div className="h-64">
                  {projects.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={projects} margin={{ bottom: 15 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#64748B', fontSize: 10, fontWeight: 500 }} 
                          interval={0}
                          angle={-20}
                          textAnchor="end"
                          height={55}
                          tickFormatter={(val) => val && val.length > 20 ? `${val.substring(0, 18)}...` : val}
                        />
                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748B'}} />
                        <RechartsTooltip cursor={{ fill: 'rgba(241, 245, 249, 0.4)', radius: 4 }} />
                        <Legend />
                        <Bar dataKey="spent" name="Spent ($)" fill="#00D9FF" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="budget" name="Allocated Budget ($)" fill="#94A3B8" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-400">No data available</div>
                  )}
                </div>
              </div>

              {/* Company Ticket Costs */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 lg:col-span-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold text-slate-900">Re; company Cost Allocation</h3>
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-black uppercase tracking-wider">Re; company</span>
                  </div>
                  <p className="text-xs text-slate-500 mb-4">Breakdown of ticket costs allocated directly to Re; company instead of project budgets.</p>
                  
                  <div className="space-y-4 max-h-52 overflow-y-auto pr-1">
                    {companies.length > 0 ? (
                      companies.map((comp) => {
                        const total = (comp.spent || 0) + (comp.pending || 0);
                        return (
                          <div key={comp.name} className="space-y-1">
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-extrabold text-slate-800">{comp.name}</span>
                              <span className="font-mono font-bold text-slate-900">${total.toLocaleString()}</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden flex">
                              {comp.spent > 0 && (
                                <div 
                                  title={`Spent: $${comp.spent.toLocaleString()}`}
                                  className="bg-emerald-500 h-full" 
                                  style={{ width: `${(comp.spent / (total || 1)) * 100}%` }} 
                                />
                              )}
                              {comp.pending > 0 && (
                                <div 
                                  title={`Pending: $${comp.pending.toLocaleString()}`}
                                  className="bg-amber-400 h-full" 
                                  style={{ width: `${(comp.pending / (total || 1)) * 15}%` }} 
                                />
                              )}
                            </div>
                            <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                              <span>Paid: ${comp.spent.toLocaleString()}</span>
                              <span>Pending: ${comp.pending.toLocaleString()}</span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-center text-xs text-slate-400 py-10">No costs currently allocated to Re; company.</div>
                    )}
                  </div>
                </div>
              </div>

            </div>

            {/* Monthly Route Average & Ticket Volume Analysis */}
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mt-8"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Plane className="w-5 h-5 text-sky-500" />
                    Monthly Route Average & Ticket Volume Analysis
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Sector-by-sector ticket analysis showing per-head average fares (Economy vs. Business) and monthly totals.
                  </p>
                </div>
              </div>

              {(() => {
                const sortedAnalyticMonths = Object.keys(monthlyRouteStats).sort((a, b) => {
                  if (a === 'No Specified Month') return 1;
                  if (b === 'No Specified Month') return -1;
                  try {
                    return new Date(a).getTime() - new Date(b).getTime();
                  } catch {
                    return 0;
                  }
                });

                if (sortedAnalyticMonths.length === 0) {
                  return (
                    <div className="text-center text-sm text-slate-400 py-8">
                      No ticket data available to perform route analysis.
                    </div>
                  );
                }

                return (
                  <div className="space-y-6">
                    {sortedAnalyticMonths.map((month, idx) => {
                      const monthData = monthlyRouteStats[month];
                      return (
                        <div key={`${month}-${idx}`} className="bg-slate-50/55 rounded-xl border border-slate-200/60 p-5">
                          {/* Month Header and Overall counters */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-slate-200/60 pb-3">
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-slate-500" />
                              <span className="font-extrabold text-slate-900 text-sm">{month}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="bg-slate-200/60 text-slate-700 text-[10.5px] font-bold px-2.5 py-1 rounded-lg border border-slate-300/40">
                                Total: <strong className="text-slate-900">{monthData.totalCount}</strong> tickets
                              </span>
                              {monthData.businessCount > 0 && (
                                <span className="bg-amber-50 text-amber-700 text-[10.5px] font-bold px-2.5 py-1 rounded-lg border border-amber-200/60 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                  Business: <strong className="text-amber-900">{monthData.businessCount}</strong>
                                </span>
                              )}
                              <span className="bg-sky-50 text-sky-700 text-[10.5px] font-bold px-2.5 py-1 rounded-lg border border-sky-100 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
                                Economy: <strong className="text-sky-900">{monthData.economyCount}</strong>
                              </span>
                            </div>
                          </div>

                          {/* Route Grid */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {[
                              { key: 'CMB-MLE', label: 'CMB - MLE' },
                              { key: 'CMB-MLE-CMB', label: 'CMB - MLE - CMB' },
                              { key: 'MLE-CMB', label: 'MLE - CMB' },
                              { key: 'MLE-CMB-MLE', label: 'MLE - CMB - MLE' }
                            ].map((routeDef, rIdx) => {
                              const rData = monthData.routes[routeDef.key];
                              
                              // Format averages helper
                              const renderFareDetails = (dataGroup: { USD: { sum: number; count: number }; LKR: { sum: number; count: number } }) => {
                                const fares: string[] = [];
                                if (dataGroup.USD.count > 0) {
                                  const avg = dataGroup.USD.sum / dataGroup.USD.count;
                                  fares.push(`$${avg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${dataGroup.USD.count} tkt)`);
                                }
                                if (dataGroup.LKR.count > 0) {
                                  const avg = dataGroup.LKR.sum / dataGroup.LKR.count;
                                  fares.push(`LKR ${avg.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} (${dataGroup.LKR.count} tkt)`);
                                }
                                if (fares.length === 0) return <span className="text-slate-400 font-medium italic text-[11px]">No flights</span>;
                                return (
                                  <div className="space-y-1">
                                    {fares.map((f, fIdx) => (
                                      <span key={fIdx} className="block text-slate-800 font-bold text-xs font-mono">{f}</span>
                                    ))}
                                  </div>
                                );
                              };

                              const hasBusiness = rData.business.USD.count > 0 || rData.business.LKR.count > 0;
                              const hasEconomy = rData.economy.USD.count > 0 || rData.economy.LKR.count > 0;
                              const hasAny = rData.all.USD.count > 0 || rData.all.LKR.count > 0;

                              return (
                                <div key={`${routeDef.key}-${rIdx}`} className="bg-white rounded-xl border border-slate-200 p-4 shadow-3xs flex flex-col justify-between hover:border-sky-200 transition-colors">
                                  <div>
                                    <div className="flex items-center justify-between gap-1 border-b border-slate-100 pb-2 mb-2.5">
                                      <h4 className="text-xs font-extrabold text-slate-700 tracking-wide">{routeDef.label}</h4>
                                      <span className="text-[9px] bg-slate-100 text-slate-500 font-semibold px-1.5 py-0.5 rounded font-mono">Sector</span>
                                    </div>

                                    {/* Business and Economy Rows */}
                                    <div className="space-y-3">
                                      {/* Economy Class */}
                                      <div className="flex justify-between items-start">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Economy:</span>
                                        <div className="text-right">
                                          {renderFareDetails(rData.economy)}
                                        </div>
                                      </div>

                                      {/* Business Class */}
                                      {(hasBusiness || !hasAny) && (
                                        <div className="flex justify-between items-start pt-2 border-t border-slate-100/60">
                                          <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider mt-0.5">Business:</span>
                                          <div className="text-right">
                                            {renderFareDetails(rData.business)}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  <div className="mt-3.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[9.5px] text-slate-400 font-medium">
                                    <span>Sector Total:</span>
                                    <span className="font-extrabold text-slate-600 font-mono">
                                      {rData.all.USD.count + rData.all.LKR.count} tkts
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </motion.div>

            {/* Project Budget Health Cards Section */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mt-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <span className="inline-block w-2.5 h-5 bg-emerald-500 rounded-sm" />
                    Project Budget Health Cards
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Real-time tracking of allocated travel budgets, spent & pending commitments, and active health status.
                  </p>
                </div>
                {/* Health Filter buttons */}
                <div className="flex flex-wrap gap-2 self-start sm:self-auto">
                  {['ALL', 'CRITICAL', 'WARNING', 'HEALTHY'].map((healthStatus) => {
                    const count = (projects || []).filter(proj => {
                      const totalCommitted = (proj.spent || 0) + (proj.pending || 0);
                      const utilRate = proj.budget > 0 ? (totalCommitted / proj.budget) * 100 : 0;
                      if (healthStatus === 'ALL') return true;
                      if (healthStatus === 'CRITICAL') return utilRate >= 90;
                      if (healthStatus === 'WARNING') return utilRate >= 70 && utilRate < 90;
                      if (healthStatus === 'HEALTHY') return utilRate < 70;
                      return true;
                    }).length;
                    
                    return (
                      <button
                        key={healthStatus}
                        type="button"
                        onClick={() => setSelectedBudgetHealthFilter(healthStatus)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                          selectedBudgetHealthFilter === healthStatus
                            ? healthStatus === 'CRITICAL' ? 'bg-red-100 text-red-750 border border-red-300'
                              : healthStatus === 'WARNING' ? 'bg-amber-100 text-amber-705 border border-amber-300'
                              : healthStatus === 'HEALTHY' ? 'bg-emerald-100 text-emerald-850 border border-emerald-350'
                              : 'bg-slate-900 text-white'
                            : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                        }`}
                      >
                        {healthStatus} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Aggregated Budget stats row */}
              {(() => {
                const totalBudget = (projects || []).reduce((acc, p) => acc + (p.budget || 0), 0);
                const totalSpent = (projects || []).reduce((acc, p) => acc + (p.spent || 0), 0);
                const totalPending = (projects || []).reduce((acc, p) => acc + (p.pending || 0), 0);
                const overallCommitted = totalSpent + totalPending;
                const overallUtilRate = totalBudget > 0 ? Math.round((overallCommitted / totalBudget) * 100) : 0;
                
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                    <div className="space-y-1">
                      <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Total Project Budget</span>
                      <span className="text-lg font-black text-slate-900 font-mono">${totalBudget.toLocaleString()}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Total Spent (Paid)</span>
                      <span className="text-lg font-black text-emerald-600 font-mono">${totalSpent.toLocaleString()}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Total Committed (Unpaid)</span>
                      <span className="text-lg font-black text-amber-600 font-mono">${totalPending.toLocaleString()}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Overall Utilization</span>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-black text-slate-900 font-mono">{overallUtilRate}%</span>
                        <div className="flex-1 bg-slate-200 rounded-full h-2 max-w-[100px] overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              overallUtilRate >= 90 ? 'bg-red-500' : overallUtilRate >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(overallUtilRate, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Cards grid */}
              {(() => {
                const filteredProjects = (projects || []).filter(proj => {
                  const totalCommitted = (proj.spent || 0) + (proj.pending || 0);
                  const utilRate = proj.budget > 0 ? (totalCommitted / proj.budget) * 100 : 0;
                  if (selectedBudgetHealthFilter === 'ALL') return true;
                  if (selectedBudgetHealthFilter === 'CRITICAL') return utilRate >= 90;
                  if (selectedBudgetHealthFilter === 'WARNING') return utilRate >= 70 && utilRate < 90;
                  if (selectedBudgetHealthFilter === 'HEALTHY') return utilRate < 70;
                  return true;
                });

                if (filteredProjects.length === 0) {
                  return (
                    <div className="text-center text-xs text-slate-400 py-10 border border-dashed border-slate-200 rounded-xl bg-slate-50/20">
                      No projects match the selected budget health filter.
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredProjects.map((proj) => {
                      const totalCommitted = (proj.spent || 0) + (proj.pending || 0);
                      const utilRate = proj.budget > 0 ? Math.round((totalCommitted / proj.budget) * 100) : 0;
                      const remaining = (proj.budget || 0) - totalCommitted;
                      
                      let healthLabel = 'Healthy';
                      let cardBorder = 'border-slate-200 hover:border-emerald-300';
                      let progressColor = 'bg-emerald-500';
                      let bgGradient = 'from-emerald-50/10 to-transparent';
                      let badgeStyle = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                      
                      if (utilRate >= 100) {
                        healthLabel = 'Budget Exceeded';
                        cardBorder = 'border-red-300 hover:border-red-400 ring-1 ring-red-500/20 shadow-xs';
                        progressColor = 'bg-red-650';
                        bgGradient = 'from-red-50/20 to-transparent';
                        badgeStyle = 'bg-red-100 text-red-800 border-red-300 animate-pulse font-black';
                      } else if (utilRate >= 90) {
                        healthLabel = 'Critical';
                        cardBorder = 'border-red-250 hover:border-red-350 shadow-xs';
                        progressColor = 'bg-red-500';
                        bgGradient = 'from-red-50/10 to-transparent';
                        badgeStyle = 'bg-red-100 text-red-700 border-red-200';
                      } else if (utilRate >= 70) {
                        healthLabel = 'Warning';
                        cardBorder = 'border-amber-250 hover:border-amber-350';
                        progressColor = 'bg-amber-500';
                        bgGradient = 'from-amber-50/10 to-transparent';
                        badgeStyle = 'bg-amber-50 text-amber-700 border-amber-200';
                      }

                      return (
                        <div
                          key={proj.id}
                          className={`bg-gradient-to-b ${bgGradient} bg-white rounded-xl border ${cardBorder} p-5 flex flex-col justify-between transition-all duration-200 hover:shadow-xs relative overflow-hidden`}
                        >
                          <div>
                            <div className="flex justify-between items-start gap-2 mb-3">
                              <h4 className="text-xs font-bold text-slate-900 line-clamp-1 leading-snug" title={proj.name}>
                                {proj.name}
                              </h4>
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border shrink-0 ${badgeStyle}`}>
                                {healthLabel}
                              </span>
                            </div>

                            {/* Progress bar visual */}
                            <div className="space-y-1.5 mb-4">
                              <div className="flex justify-between text-[10px] font-extrabold text-slate-500">
                                <span>Utilization Rate</span>
                                <span className={utilRate >= 90 ? 'text-red-650' : utilRate >= 70 ? 'text-amber-600' : 'text-emerald-700'}>
                                  {utilRate}%
                                </span>
                              </div>
                              <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden border border-slate-150/50">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
                                  style={{ width: `${Math.min(utilRate, 100)}%` }}
                                />
                              </div>
                            </div>

                            {/* Details list */}
                            <div className="grid grid-cols-2 gap-y-2.5 gap-x-2 text-[10.5px] border-t border-slate-100 pt-3 font-medium">
                              <div>
                                <span className="text-slate-400 block text-[9.5px] uppercase tracking-wider font-extrabold">Allocated Budget</span>
                                <span className="text-slate-800 font-mono font-bold">${(proj.budget || 0).toLocaleString()}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[9.5px] uppercase tracking-wider font-extrabold">Total Committed</span>
                                <span className="text-slate-800 font-mono font-bold">${totalCommitted.toLocaleString()}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[9.5px] uppercase tracking-wider font-extrabold">Spent (Paid)</span>
                                <span className="text-emerald-600 font-mono font-bold">${(proj.spent || 0).toLocaleString()}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[9.5px] uppercase tracking-wider font-extrabold">Pending (Unpaid)</span>
                                <span className="text-amber-600 font-mono font-bold">${(proj.pending || 0).toLocaleString()}</span>
                              </div>
                            </div>
                          </div>

                          {/* Remaining balance box */}
                          <div className={`mt-4 p-2 rounded-lg text-center font-mono ${
                            remaining < 0 
                              ? 'bg-rose-50 text-red-750 border border-rose-200' 
                              : 'bg-slate-50 text-slate-700 border border-slate-100'
                          } border text-[10.5px]`}>
                            <span className="font-semibold uppercase text-[9px] tracking-wider block text-slate-400">
                              {remaining < 0 ? 'Deficit / Overdraft' : 'Remaining Balance'}
                            </span>
                            <span className="text-xs font-black">
                              {remaining < 0 ? `-$${Math.abs(remaining).toLocaleString()}` : `$${remaining.toLocaleString()}`}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Sub-contractor Ticket Entitlements Summary Section */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mt-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <span className="inline-block w-2.5 h-5 bg-sky-500 rounded-sm" />
                    Sub-contractor Ticket Entitlements Summary
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Pre-agreed ticket entitlements set per project and Re; company, with tickets applied and remaining allowances.
                  </p>
                </div>
                <div className="flex items-center gap-3 self-start sm:self-auto">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search project or company..."
                      value={entitlementSearch}
                      onChange={(e) => setEntitlementSearch(e.target.value)}
                      className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-sky-500 outline-none block w-48 transition-all bg-white"
                    />
                    {entitlementSearch && (
                      <button
                        onClick={() => setEntitlementSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1 text-xs text-slate-400 hover:text-slate-600 font-bold"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <div className="text-xs bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg border border-slate-200 font-mono font-medium">
                    Projects: {subcontractorEntitlementsData.length}
                  </div>
                </div>
              </div>

              {filteredEntitlements.length === 0 ? (
                <div className="text-center text-xs text-slate-400 py-8 italic border border-dashed border-slate-200 rounded-lg">
                  {entitlementSearch ? 'No matching entitlements found.' : 'No active subcontractor ticket entitlements set up.'}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-150 max-h-96 overflow-y-auto">
                  <table className="min-w-full divide-y divide-slate-150">
                    <thead className="bg-slate-50 sticky top-0 z-10">
                      <tr>
                        <th scope="col" className="px-5 py-2.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Project Name</th>
                        <th scope="col" className="px-5 py-2.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Re; company</th>
                        <th scope="col" className="px-5 py-2.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Cycle / Period Type</th>
                        <th scope="col" className="px-5 py-2.5 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Initial Limit</th>
                        <th scope="col" className="px-5 py-2.5 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Applied Count</th>
                        <th scope="col" className="px-5 py-2.5 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Remaining Allowance</th>
                        <th scope="col" className="px-5 py-2.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Reset / Expiry info</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-150">
                      {filteredEntitlements.map((item, idx) => (
                        <tr key={`${item.projectId}-${item.company}-${idx}`} className="hover:bg-slate-50/75 transition-colors">
                          <td className="px-5 py-3 whitespace-nowrap text-xs font-semibold text-slate-800">{item.projectName}</td>
                          <td className="px-5 py-3 whitespace-nowrap text-xs text-slate-600 font-medium">{item.company}</td>
                          <td className="px-5 py-3 whitespace-nowrap text-xs text-slate-600 font-medium">
                            {item.cycle === 'MONTHLY' ? (
                              <span className="inline-flex items-center gap-1 bg-sky-50 text-sky-700 px-2 py-0.5 rounded text-[10px] font-bold border border-sky-150">
                                🗓️ Monthly Renew
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 px-2 py-0.5 rounded text-[10px] font-bold border border-purple-150">
                                🏗️ Project Period ({item.duration}M)
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3 whitespace-nowrap text-center text-xs font-mono text-slate-700">{item.initial}</td>
                          <td className="px-5 py-3 whitespace-nowrap text-center text-xs font-mono text-amber-600 font-semibold">
                            {item.applied}
                          </td>
                          <td className="px-5 py-3 whitespace-nowrap text-center">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                              item.remaining < 0 
                                ? 'bg-rose-100 text-rose-800 border border-rose-300 animate-pulse' 
                                : item.remaining === 0 
                                  ? 'bg-red-50 text-red-700 border border-red-150' 
                                  : item.remaining <= 5 
                                    ? 'bg-amber-50 text-amber-700 border border-amber-150' 
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-150'
                            }`}>
                              {item.remaining < 0 
                                ? `🚨 Exceeded by ${Math.abs(item.remaining)}` 
                                : `${item.remaining} remaining`}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-xs">
                            {item.cycle === 'MONTHLY' ? (
                              <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
                                <span className="w-1 h-1 rounded-full bg-sky-400" />
                                Resets calendar month
                              </span>
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                {item.startDate ? (
                                  <span className="text-[10px] text-slate-500 font-medium">
                                    Started: <strong>{item.startDate}</strong>
                                  </span>
                                ) : (
                                  <span className="text-[9px] text-slate-400 italic">No start date</span>
                                )}
                                {item.isExpired ? (
                                  <span className="inline-flex items-center text-[9px] bg-rose-50 border border-rose-200 text-rose-700 px-1 py-0.2 rounded font-bold self-start mt-0.5">
                                    Expired ({item.expirationWarningStr})
                                  </span>
                                ) : item.startDate ? (
                                  <span className="inline-flex items-center text-[9px] bg-emerald-50 border border-emerald-200 text-emerald-700 px-1 py-0.2 rounded font-medium self-start mt-0.5">
                                    Active ({item.expirationWarningStr})
                                  </span>
                                ) : null}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </>
        )}

        {/* Tickets Table */}
        {activeTab === 'ALL_TICKETS' && role !== 'FINANCE' && (
          <div className="space-y-4">
            <div className="bg-white p-0.5 rounded-lg border border-slate-200 inline-flex shadow-2xs gap-0.5" role="group" aria-label="Ticket view filters">
              <button
                type="button"
                aria-pressed={allTicketsSubTab === 'SUMMARY'}
                onClick={() => setAllTicketsSubTab('SUMMARY')}
                className={`px-3 py-1 text-xs font-semibold rounded transition-colors focus:outline-none focus:ring-1 focus:ring-sky-500 ${allTicketsSubTab === 'SUMMARY' ? 'bg-sky-50 text-sky-700' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Air ticket summary sheet
              </button>
              <button
                type="button"
                aria-pressed={allTicketsSubTab === 'NO_ISSUE'}
                onClick={() => setAllTicketsSubTab('NO_ISSUE')}
                className={`px-3 py-1 text-xs font-semibold rounded transition-colors focus:outline-none focus:ring-1 focus:ring-sky-500 ${allTicketsSubTab === 'NO_ISSUE' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Ticket with no issue
              </button>
              <button
                type="button"
                aria-pressed={allTicketsSubTab === 'MISSED'}
                onClick={() => setAllTicketsSubTab('MISSED')}
                className={`px-3 py-1 text-xs font-semibold rounded transition-colors focus:outline-none focus:ring-1 focus:ring-sky-500 ${allTicketsSubTab === 'MISSED' ? 'bg-sky-50 text-sky-700' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Passengers who missed their flight
              </button>
              <button
                type="button"
                aria-pressed={allTicketsSubTab === 'UPDATE_REQUIRED'}
                onClick={() => setAllTicketsSubTab('UPDATE_REQUIRED')}
                className={`px-3 py-1 text-xs font-semibold rounded transition-colors flex items-center focus:outline-none focus:ring-1 focus:ring-red-500 ${allTicketsSubTab === 'UPDATE_REQUIRED' ? 'bg-red-50 text-red-700' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {updateRequiredCount > 0 && <span className="mr-1.5 inline-flex items-center justify-center bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.25 rounded-full">{updateRequiredCount}</span>}
                Update Required
              </button>
              <button
                type="button"
                aria-pressed={allTicketsSubTab === 'INVOICE_PENDING'}
                onClick={() => setAllTicketsSubTab('INVOICE_PENDING')}
                className={`px-3 py-1 text-xs font-semibold rounded transition-colors flex items-center focus:outline-none focus:ring-1 focus:ring-amber-500 ${allTicketsSubTab === 'INVOICE_PENDING' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {invoicePendingCount > 0 && <span className="mr-1.5 inline-flex items-center justify-center bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.25 rounded-full">{invoicePendingCount}</span>}
                Invoice Pending
              </button>
              <button
                type="button"
                aria-pressed={allTicketsSubTab === 'DANGER_ZONE'}
                onClick={() => setAllTicketsSubTab('DANGER_ZONE')}
                className={`px-3 py-1 text-xs font-semibold rounded transition-colors flex items-center focus:outline-none focus:ring-1 focus:ring-orange-500 ${allTicketsSubTab === 'DANGER_ZONE' ? 'bg-orange-50 text-orange-700' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Danger Zone
              </button>
              <button
                type="button"
                aria-pressed={allTicketsSubTab === 'PAYMENT_DONE'}
                onClick={() => setAllTicketsSubTab('PAYMENT_DONE')}
                className={`px-3 py-1 text-xs font-semibold rounded transition-colors flex items-center focus:outline-none focus:ring-1 focus:ring-emerald-500 ${allTicketsSubTab === 'PAYMENT_DONE' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Payment Done List
              </button>
            </div>
            
            <div className="bg-white shadow-xs border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-3 border-b border-slate-200 flex flex-wrap gap-3 justify-between items-center bg-slate-50">
              <h2 className="text-sm font-bold text-slate-800">All Tickets</h2>
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input 
                  id="search-tickets"
                  type="search" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search passengers or passports..." 
                  aria-label="Search passengers or passports"
                  className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-sky-500 outline-none block w-56 transition-all bg-white"
                />
              </div>
              <select
                id="status-filter"
                aria-label="Filter by ticket status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="py-1.5 pl-2.5 pr-7 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-sky-500 outline-none bg-white font-medium text-slate-700"
              >
                <option value="ALL">All Statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
              </select>
              <select
                id="agent-filter"
                aria-label="Filter by travel agent"
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
                className="py-1.5 pl-2.5 pr-7 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-sky-500 outline-none bg-white max-w-[130px] truncate font-medium text-slate-700"
              >
                <option value="ALL">All Agents</option>
                {getFilteredOptions('TRAVEL_AGENT').map((opt, idx) => (
                  <option key={opt.id || `agent-filt-${opt.value}-${idx}`} value={opt.value}>{opt.value}</option>
                ))}
              </select>
              <select
                id="ticket-type-filter"
                aria-label="Filter by ticket type"
                value={ticketTypeFilter}
                onChange={(e) => setTicketTypeFilter(e.target.value)}
                className="py-1.5 pl-2.5 pr-7 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-sky-500 outline-none bg-white max-w-[130px] truncate font-medium text-slate-700"
              >
                <option value="ALL">All Ticket Types</option>
                <option value="ONE_WAY">One Way</option>
                <option value="RETURN">Return</option>
                {getFilteredOptions('TICKET_TYPE').map((opt, idx) => (
                  <option key={opt.id || `ticket-filt-${opt.value}-${idx}`} value={opt.value}>{opt.value}</option>
                ))}
              </select>
              <div className="flex items-center gap-1 text-[11px] text-slate-600">
                <span className="font-semibold text-slate-500">Dep:</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  aria-label="Departure date from"
                  className="px-1.5 py-1 border border-slate-300 rounded text-[11px] bg-white focus:ring-1 focus:ring-sky-500 outline-none"
                />
                <span className="text-slate-400">to</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  aria-label="Departure date to"
                  className="px-1.5 py-1 border border-slate-300 rounded text-[11px] bg-white focus:ring-1 focus:ring-sky-500 outline-none"
                />
              </div>
              {(searchQuery || statusFilter !== 'ALL' || agentFilter !== 'ALL' || ticketTypeFilter !== 'ALL' || dateFrom || dateTo) && (
                <button
                  type="button"
                  onClick={() => { setSearchQuery(''); setStatusFilter('ALL'); setAgentFilter('ALL'); setTicketTypeFilter('ALL'); setDateFrom(''); setDateTo(''); }}
                  className="text-xs text-slate-500 hover:text-slate-800 underline focus:outline-none px-1.5 py-0.5"
                  aria-label="Clear all filters"
                >
                  Clear filters
                </button>
              )}
              <button 
                type="button"
                onClick={handleExportCSV}
                className="inline-flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1"
                title="Export Filtered CSV"
                aria-label="Export filtered tickets to CSV"
              >
                <Download className="h-4 w-4 md:mr-1" aria-hidden="true" />
                <span className="hidden md:inline">Export</span>
              </button>
              {role === 'ADMIN' && selectedTickets.size > 0 && (
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  className="inline-flex items-center px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-1 ml-2"
                >
                  <Trash2 className="h-4 w-4 mr-1" aria-hidden="true" /> Delete ({selectedTickets.size})
                </button>
              )}
              {(role === 'ADMIN1' || role === 'ADMIN') && (
                <button 
                  type="button"
                  onClick={() => setActiveTab('NEW_TICKET')}
                  className="inline-flex items-center px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1 ml-2"
                >
                  <Plus className="h-4 w-4 mr-1" aria-hidden="true" /> New Ticket
                </button>
              )}
              {activeTab === 'ALL_TICKETS' && allTicketsSubTab !== 'SUMMARY' && (
                <div className="relative ml-2">
                  <button
                    type="button"
                    onClick={() => setShowColumnDropdown(!showColumnDropdown)}
                    className="inline-flex items-center px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg transition-colors focus:outline-none focus:ring-1 focus:ring-sky-500 shadow-xs"
                    aria-label="Toggle Columns Visibility"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5 mr-1 text-slate-500" />
                    <span>Columns</span>
                  </button>
                  {showColumnDropdown && (
                    <div className="absolute right-0 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-50 p-2 text-xs">
                      <div className="font-semibold text-slate-700 px-2 py-1 border-b border-slate-100 mb-1 flex justify-between items-center">
                        <span>Show/Hide Columns</span>
                        <button 
                          type="button" 
                          onClick={() => setVisibleColumns({
                            passenger_name: true,
                            pp_number: true,
                            attached_images: true,
                            project_id: true,
                            route: true,
                            ticketing_agency: true,
                            approved_cost: true,
                            invoice_details: true,
                            po_number: true,
                            status: true,
                            flight_status: true,
                            workflow: true
                          })}
                          className="text-[10px] text-sky-600 hover:underline"
                        >
                          Reset
                        </button>
                      </div>
                      <div className="space-y-1 max-h-60 overflow-y-auto py-1">
                        {[
                          { key: 'passenger_name', label: 'Passenger Name' },
                          { key: 'pp_number', label: 'Passport Number' },
                          { key: 'attached_images', label: 'Attached Images' },
                          { key: 'project_id', label: 'Project' },
                          { key: 'route', label: 'Route' },
                          { key: 'ticketing_agency', label: 'Ticketing Agency' },
                          { key: 'approved_cost', label: 'Approved Cost' },
                          { key: 'invoice_details', label: 'Invoice Details' },
                          { key: 'po_number', label: 'PO Number' },
                          { key: 'status', label: 'Status' },
                          { key: 'flight_status', label: 'Flight Status' },
                          { key: 'workflow', label: 'Workflow Progress' },
                        ].map((col) => (
                          <label key={col.key} className="flex items-center space-x-2 px-2 py-1 hover:bg-slate-50 rounded cursor-pointer">
                            <input
                              type="checkbox"
                              checked={visibleColumns[col.key] ?? true}
                              onChange={(e) => setVisibleColumns({
                                ...visibleColumns,
                                [col.key]: e.target.checked
                              })}
                              className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-3.5 h-3.5"
                            />
                            <span className="text-slate-700 font-medium">{col.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {activeTab === 'ALL_TICKETS' && allTicketsSubTab === 'NO_ISSUE' && (
                <div className="bg-slate-100 p-0.5 rounded-lg border border-slate-200 inline-flex shadow-inner ml-2">
                  <button
                    type="button"
                    onClick={() => { setViewMode('table'); localStorage.setItem('noIssueViewMode', 'table'); }}
                    className={`p-1.5 rounded-md transition-colors ${viewMode === 'table' ? 'bg-white text-slate-800 shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-800'}`}
                    title="Table View"
                    aria-label="Table View"
                  >
                    <List className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => { setViewMode('cards'); localStorage.setItem('noIssueViewMode', 'cards'); }}
                    className={`p-1.5 rounded-md transition-colors ${viewMode === 'cards' ? 'bg-white text-slate-800 shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-800'}`}
                    title="Display Cards"
                    aria-label="Display Cards"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
           {/* Mobile card view */}
          <div className="block md:hidden divide-y divide-slate-200">
            {pagedTickets.length === 0 ? (
              <div className="px-6 py-8 text-center text-slate-500">No tickets found.</div>
            ) : pagedTickets.map((t, idx) => {
              const docs = getTicketDocuments(t);
              return (
                <div key={`${t.id}-${idx}`} className={`p-4 transition-colors cursor-pointer border-l-4 ${
                  activeTab === 'ALL_TICKETS' && allTicketsSubTab === 'INVOICE_PENDING' && ['NO_SHOW', 'CANCELLED', 'RESCHEDULED'].includes(t.flight_status) && (!t.other_invoice_number || !t.other_invoice_number.trim())
                    ? 'animate-pulse-glowing-amber border-amber-600'
                    : t.flight_status === 'NO_SHOW' || t.rescheduled_flight_status === 'NO_SHOW'
                      ? 'bg-red-50/40 hover:bg-red-50 border-red-550'
                      : 'bg-white hover:bg-slate-50 border-transparent'
                }`} onClick={() => navigate(`/tickets/${t.id}`)}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="font-semibold text-slate-900 text-sm flex items-center space-x-1.5">
                      {(role === 'ADMIN1' || role === 'SUPER_ADMIN' || role === 'ADMIN') && (
                        <div className="mr-1 mt-0.5" onClick={(e) => e.stopPropagation()}>
                          <input 
                            type="checkbox" 
                            className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer w-4 h-4"
                            checked={selectedTickets.has(t.id)}
                            onChange={(e) => {
                              const newSelected = new Set(selectedTickets);
                              if (e.target.checked) {
                                newSelected.add(t.id);
                              } else {
                                newSelected.delete(t.id);
                              }
                              setSelectedTickets(newSelected);
                            }}
                          />
                        </div>
                      )}
                      {(t.flight_status === 'NO_SHOW' || t.rescheduled_flight_status === 'NO_SHOW') && (
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-650"></span>
                        </span>
                      )}
                      <span>{t.passenger_name}</span>
                    </div>
                    <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${
                      t.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' :
                      t.status === 'DRAFT' ? 'bg-slate-100 text-slate-800' : 'bg-blue-100 text-blue-800'
                    }`}>{t.status}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {t.pp_number} · {
                      Array.isArray(t.project_ids) && t.project_ids.length > 0
                        ? t.project_ids.map((id: string) => allProjects.find(p => p.id === id)?.name || id).join(', ')
                        : (allProjects.find(p => p.id === t.project_id)?.name || t.project_id || '-')
                    }
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-50 text-xs text-slate-600">
                    <div>
                      <span className="text-slate-400 block text-[9px] uppercase font-bold">Departure Date</span>
                      <span className="font-medium">{t.departure_date || '-'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px] uppercase font-bold">Flight Status</span>
                      {t.flight_status === 'NO_SHOW' || t.rescheduled_flight_status === 'NO_SHOW' ? (
                        <span className="inline-flex items-center font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded text-[10px] leading-none">
                          <span className="relative flex h-1.5 w-1.5 mr-1">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-600"></span>
                          </span>
                          NO_SHOW
                        </span>
                      ) : (
                        <span className={`font-semibold px-1.5 py-0.5 rounded text-[10px] inline-block border ${
                          t.flight_status === 'DEPARTED' ? 'text-emerald-700 bg-emerald-50 border-emerald-150' :
                          t.flight_status === 'PENDING' || !t.flight_status ? 'text-slate-600 bg-slate-100 border-slate-200' :
                          'text-sky-700 bg-sky-50 border-sky-150'
                        }`}>{t.flight_status || 'PENDING'}</span>
                      )}
                    </div>
                  </div>

                  {/* Document previews carousel inside the mobile card! */}
                  {docs.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-slate-100">
                      <span className="block text-[9px] uppercase font-bold text-slate-400 mb-1.5">Attached Scans / Documents ({docs.length})</span>
                      <div className="flex items-center space-x-2 overflow-x-auto py-1 scrollbar-hidden">
                        {docs.map((doc, idx) => (
                          <div 
                            key={idx}
                            onClick={(e) => { e.stopPropagation(); setLightboxImage(doc.url); }}
                            className="relative flex-none w-12 h-12 bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center justify-center p-0.5"
                            title={doc.label}
                          >
                            {isWebUrl(doc.url) ? (
                              <div className="w-full h-full bg-sky-50/80 flex flex-col items-center justify-center rounded">
                                <ExternalLink className="w-5 h-5 text-sky-600" />
                                <span className="text-[7px] font-extrabold text-sky-600 block leading-none mt-0.5">WEB</span>
                              </div>
                            ) : isPdfUrl(doc.url) ? (
                              <div className="w-full h-full bg-red-500/15 flex flex-col items-center justify-center rounded">
                                <FileText className="w-5 h-5 text-red-500" />
                                <span className="text-[7px] font-extrabold text-red-600 block">PDF</span>
                              </div>
                            ) : (
                              <img src={doc.url} alt={doc.label} className="w-full h-full object-cover rounded" />
                            )}
                            <span className="absolute bottom-0 inset-x-0 bg-slate-900/75 text-[6px] text-white text-center font-bold tracking-wider py-0 rounded-b select-none uppercase truncate px-0.5">{doc.label}</span>
                          </div>
                        ))}
                        <button 
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setUploadTicketId(t.id); }}
                          className="flex-none w-12 h-12 border border-dashed border-slate-300 hover:border-sky-500 hover:bg-sky-50 rounded-lg flex flex-col items-center justify-center text-slate-400 hover:text-sky-600 transition-colors"
                          title="Attach Document"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span className="text-[6px] font-bold mt-0.5 uppercase">ADD</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop view */}
          <div className="hidden md:block">
            {activeTab === 'ALL_TICKETS' && allTicketsSubTab === 'NO_ISSUE' && viewMode === 'cards' ? (
              // Desktop card grid view
              pagedTickets.length === 0 ? (
                <div className="bg-white px-6 py-12 text-center text-slate-500 rounded-xl border border-dashed border-slate-200">
                  <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  No tickets with "No Issue" found.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6 bg-slate-50/50 rounded-b-xl border border-slate-200">
                  {pagedTickets.map((t, idx) => {
                    const docs = getTicketDocuments(t);
                    return (
                      <div key={`${t.id}-${idx}`} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between hover:shadow-md hover:border-slate-300 transition-all cursor-pointer relative group" onClick={() => navigate(`/tickets/${t.id}`)}>
                        <div className="absolute top-0 right-0 -mr-1 -mt-1 w-12 h-12 overflow-hidden rounded-tr-2xl pointer-events-none">
                          <div className="bg-emerald-500 text-white text-[8px] font-bold py-1 px-4 text-center rotate-45 translate-x-3 translate-y-1 uppercase tracking-wider shadow-sm">
                            Ok ✓
                          </div>
                        </div>
                        <div>
                          {/* Header */}
                          <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                            <div className="flex items-start gap-2">
                              {(role === 'ADMIN1' || role === 'SUPER_ADMIN' || role === 'ADMIN') && (
                                <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                                  <input 
                                    type="checkbox" 
                                    className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer w-4 h-4"
                                    checked={selectedTickets.has(t.id)}
                                    onChange={(e) => {
                                      const newSelected = new Set(selectedTickets);
                                      if (e.target.checked) {
                                        newSelected.add(t.id);
                                      } else {
                                        newSelected.delete(t.id);
                                      }
                                      setSelectedTickets(newSelected);
                                    }}
                                  />
                                </div>
                              )}
                              <div>
                                <div className="font-bold text-slate-800 text-base group-hover:text-sky-600 transition-colors">{t.passenger_name}</div>
                                <div className="text-xs text-slate-400 mt-0.5 font-mono">{t.pp_number}</div>
                              </div>
                            </div>
                            <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase tracking-wider">
                              {t.flight_status || 'DEPARTED'}
                            </span>
                          </div>

                          {/* Body Information */}
                          <div className="py-4 space-y-3 text-slate-600">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-400">Project / Client</span>
                              <span className="font-semibold text-slate-700 truncate max-w-[170px]" title={
                                Array.isArray(t.project_ids) && t.project_ids.length > 0
                                  ? t.project_ids.map((id: string) => allProjects.find(p => p.id === id)?.name || id).join(', ')
                                  : (allProjects.find(p => p.id === t.project_id)?.name || t.project_id || '-')
                              }>
                                {
                                  Array.isArray(t.project_ids) && t.project_ids.length > 0
                                    ? t.project_ids.map((id: string) => allProjects.find(p => p.id === id)?.name || id).join(', ')
                                    : (allProjects.find(p => p.id === t.project_id)?.name || t.project_id || '-')
                                }
                              </span>
                            </div>
                            
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-400">Departure Flight</span>
                              <span className="font-semibold text-slate-700 font-mono">
                                {t.departure_date ? new Date(t.departure_date).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '-'}
                              </span>
                            </div>

                            {t.travel_agent && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-400">Travel Agent</span>
                                <span className="font-medium text-slate-600">{t.travel_agent}</span>
                              </div>
                            )}

                            {/* Workflow checkboxes display */}
                            <div className="pt-3 flex items-center justify-between border-t border-slate-100">
                              <span className="text-slate-500 text-xs font-semibold">Workflow Progress</span>
                              <TicketProgressBar ticket={t} />
                            </div>
                          </div>
                        </div>

                        {/* Images preview and Quick actions */}
                        <div className="pt-4 border-t border-slate-100 flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              Attached Document(s) ({docs.length})
                            </span>
                            <button 
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setUploadTicketId(t.id); }}
                              className="text-[10px] font-bold text-sky-600 hover:text-sky-800 hover:underline flex items-center gap-0.5"
                            >
                              <Plus className="w-3 h-3" /> Attach File
                            </button>
                          </div>

                          {docs.length > 0 ? (
                            <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-hidden">
                              {docs.map((doc, idx) => (
                                <div 
                                  key={idx}
                                  onClick={(e) => { e.stopPropagation(); setLightboxImage(doc.url); }}
                                  className="relative flex-none w-12 h-12 bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center justify-center p-0.5 hover:border-sky-500"
                                  title={doc.label}
                                >
                                  {isWebUrl(doc.url) ? (
                                    <div className="w-full h-full bg-sky-50/80 flex flex-col items-center justify-center rounded-md">
                                      <ExternalLink className="w-5 h-5 text-sky-600" />
                                      <span className="text-[7px] font-extrabold text-sky-600 block leading-none mt-0.5">WEB</span>
                                    </div>
                                  ) : isPdfUrl(doc.url) ? (
                                    <div className="w-full h-full bg-red-500/15 flex flex-col items-center justify-center rounded-md">
                                      <FileText className="w-5 h-5 text-red-500" />
                                      <span className="text-[7px] font-extrabold text-red-600 block">PDF</span>
                                    </div>
                                  ) : (
                                    <img src={doc.url} alt={doc.label} className="w-full h-full object-cover rounded-md" />
                                  )}
                                  <span className="absolute bottom-0 inset-x-0 bg-slate-900/75 text-[6px] text-white text-center font-bold tracking-wider py-0 rounded-b-md select-none uppercase truncate px-0.5">{doc.label}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-3 text-center text-xs text-slate-400 flex items-center justify-center select-none py-4">
                              <Image className="w-4 h-4 mr-1.5 opacity-60" /> No documents attached
                            </div>
                          )}

                          <div className="mt-2 pt-2 border-t border-slate-50 flex items-center justify-between">
                            <span className="text-[11px] text-slate-400 font-medium">Status: <strong className="text-slate-600">{t.status}</strong></span>
                            <button 
                              type="button"
                              onClick={(e) => { e.stopPropagation(); navigate(`/tickets/${t.id}`); }}
                              className="inline-flex items-center text-xs font-bold text-sky-600 hover:text-sky-800 bg-sky-50 hover:bg-sky-100/50 px-2.5 py-1 rounded transition-colors"
                            >
                              View / Edit Details
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-2 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider text-center w-10 select-none bg-slate-100/50">#</th>
                  {(role === 'ADMIN1' || role === 'SUPER_ADMIN' || role === 'ADMIN') && (
                    <th className="px-2 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider text-center w-10 select-none bg-slate-100/50">
                      <input 
                        type="checkbox" 
                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer w-3.5 h-3.5"
                        checked={pagedTickets.length > 0 && pagedTickets.every(t => selectedTickets.has(t.id))}
                        onChange={(e) => {
                          const newSelected = new Set(selectedTickets);
                          if (e.target.checked) {
                            pagedTickets.forEach(t => newSelected.add(t.id));
                          } else {
                            pagedTickets.forEach(t => newSelected.delete(t.id));
                          }
                          setSelectedTickets(newSelected);
                        }}
                      />
                    </th>
                  )}
                  {activeTab === 'ALL_TICKETS' && (allTicketsSubTab === 'MISSED' || allTicketsSubTab === 'DANGER_ZONE') ? (
                    <>
                      <th className="px-2 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">Date of first scheduled flight</th>
                      <th className="px-2 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider w-40 min-w-[160px] max-w-[185px] whitespace-normal">Project</th>
                      <th className="px-2 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider w-44 min-w-[176px] max-w-[200px]">Name</th>
                      <th className="px-2 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">Passport Number</th>
                      <th className="px-2 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">Designation</th>
                      <th className="px-2 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">Re; company</th>
                      <th className="px-2 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">Date (1st ticket) ISSUED</th>
                      <th className="px-2 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">1st ticket amount</th>
                      <th className="px-2 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">Agent</th>
                      <th className="px-2 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">Date (2nd ticket)</th>
                      <th className="px-2 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">2nd ticket amount</th>
                      <th className="px-2 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">Agent (2nd)</th>
                      <th className="px-2 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">Scheduled & Gone</th>
                      <th className="px-2 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                    </>
                  ) : activeTab === 'ALL_TICKETS' && allTicketsSubTab === 'NO_ISSUE' ? (
                    <>
                      {(visibleColumns.passenger_name ?? true) && <th onClick={() => handleSort('passenger_name')} className="px-2 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none w-44 min-w-[176px] max-w-[200px]">Passenger {sortKey === 'passenger_name' && (sortDir === 'asc' ? '↑' : '↓')}</th>}
                      {(visibleColumns.pp_number ?? true) && <th onClick={() => handleSort('pp_number')} className="px-2 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none">PP Number {sortKey === 'pp_number' && (sortDir === 'asc' ? '↑' : '↓')}</th>}
                      {(visibleColumns.attached_images ?? true) && <th className="px-2 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">Attached Image(s)</th>}
                      {(visibleColumns.project_id ?? true) && <th onClick={() => handleSort('project_id')} className="px-2 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none w-40 min-w-[160px] max-w-[185px] whitespace-normal">Project {sortKey === 'project_id' && (sortDir === 'asc' ? '↑' : '↓')}</th>}
                      {(visibleColumns.route ?? true) && <th className="px-2 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">Route</th>}
                      {(visibleColumns.ticketing_agency ?? true) && <th className="px-2 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">Ticketing Agency</th>}
                      {(visibleColumns.approved_cost ?? true) && <th className="px-2 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">Approved Cost</th>}
                      {(visibleColumns.invoice_details ?? true) && <th className="px-2 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">Invoice Details</th>}
                      {(visibleColumns.po_number ?? true) && <th className="px-2 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">PO Number</th>}
                      {(visibleColumns.status ?? true) && <th onClick={() => handleSort('status')} className="px-2 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none">Status {sortKey === 'status' && (sortDir === 'asc' ? '↑' : '↓')}</th>}
                      {(visibleColumns.flight_status ?? true) && <th onClick={() => handleSort('flight_status')} className="px-2 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none">Flight Status {sortKey === 'flight_status' && (sortDir === 'asc' ? '↑' : '↓')}</th>}
                      {(visibleColumns.workflow ?? true) && <th onClick={() => handleSort('departure_date')} className="px-2 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none">Workflow Progress {sortKey === 'departure_date' && (sortDir === 'asc' ? '↑' : '↓')}</th>}
                      <th className="px-2 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                    </>
                  ) : (
                    <>
                      {(visibleColumns.passenger_name ?? true) && <th onClick={() => handleSort('passenger_name')} className="px-3 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none w-44 min-w-[176px] max-w-[200px]">Passenger {sortKey === 'passenger_name' && (sortDir === 'asc' ? '↑' : '↓')}</th>}
                      {(visibleColumns.pp_number ?? true) && <th onClick={() => handleSort('pp_number')} className="px-3 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none">PP Number {sortKey === 'pp_number' && (sortDir === 'asc' ? '↑' : '↓')}</th>}
                      {(visibleColumns.project_id ?? true) && <th onClick={() => handleSort('project_id')} className="px-3 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none w-40 min-w-[160px] max-w-[185px] whitespace-normal">Project {sortKey === 'project_id' && (sortDir === 'asc' ? '↑' : '↓')}</th>}
                      {(visibleColumns.route ?? true) && <th className="px-1 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">Route</th>}
                      {(visibleColumns.ticketing_agency ?? true) && <th className="px-1 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">Ticketing Agency</th>}
                      {(visibleColumns.approved_cost ?? true) && <th className="px-3 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">Approved Cost</th>}
                      {(visibleColumns.invoice_details ?? true) && <th className="px-3 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">Invoice Details</th>}
                      {(visibleColumns.po_number ?? true) && <th className="px-3 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">PO Number</th>}
                      {(visibleColumns.status ?? true) && <th onClick={() => handleSort('status')} className="px-3 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none">Status {sortKey === 'status' && (sortDir === 'asc' ? '↑' : '↓')}</th>}
                      {(visibleColumns.flight_status ?? true) && <th onClick={() => handleSort('flight_status')} className="px-3 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none">Flight Status {sortKey === 'flight_status' && (sortDir === 'asc' ? '↑' : '↓')}</th>}
                      {(visibleColumns.workflow ?? true) && <th onClick={() => handleSort('departure_date')} className="px-3 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none">Workflow Progress {sortKey === 'departure_date' && (sortDir === 'asc' ? '↑' : '↓')}</th>}
                      <th className="px-3 py-1.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {pagedTickets.length === 0 ? (
                  <tr>
                    <td colSpan={19} className="px-6 py-8 text-center text-slate-500">No tickets found.</td>
                  </tr>
                ) : (
                  pagedTickets.map((t, idx) => (
                    <React.Fragment key={`${t.id}-${idx}`}>
                    <tr 
                      className={`transition-all duration-150 border-l-4 hover:shadow-[0_2px_8px_-1px_rgba(0,0,0,0.06)] hover:bg-slate-50/95 relative ${
                        activeTab === 'ALL_TICKETS' && allTicketsSubTab === 'INVOICE_PENDING' 
                          ? (['NO_SHOW', 'CANCELLED', 'RESCHEDULED'].includes(t.flight_status) && (!t.other_invoice_number || !t.other_invoice_number.trim())
                            ? 'animate-pulse-glowing-amber border-amber-600'
                            : 'bg-amber-50/15 hover:bg-amber-50/25 border-amber-500')
                          : activeTab === 'ALL_TICKETS' && (allTicketsSubTab === 'MISSED' || allTicketsSubTab === 'DANGER_ZONE') 
                            ? 'cursor-pointer bg-red-50/15 hover:bg-red-50/30 border-red-500 focus:outline-none focus:bg-red-50/25' 
                            : 'hover:bg-slate-50/80 border-transparent'
                      }`} 
                      onClick={() => (activeTab === 'ALL_TICKETS' && (allTicketsSubTab === 'MISSED' || allTicketsSubTab === 'DANGER_ZONE')) && setExpandedTicketId(expandedTicketId === t.id ? null : t.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          if (activeTab === 'ALL_TICKETS' && (allTicketsSubTab === 'MISSED' || allTicketsSubTab === 'DANGER_ZONE')) {
                            setExpandedTicketId(expandedTicketId === t.id ? null : t.id);
                          }
                        }
                      }}
                      tabIndex={activeTab === 'ALL_TICKETS' && (allTicketsSubTab === 'MISSED' || allTicketsSubTab === 'DANGER_ZONE') ? 0 : undefined}
                      role={activeTab === 'ALL_TICKETS' && (allTicketsSubTab === 'MISSED' || allTicketsSubTab === 'DANGER_ZONE') ? "button" : "row"}
                      aria-expanded={expandedTicketId === t.id}
                    >
                      <td className="px-2.5 py-1.5 whitespace-nowrap text-slate-400 font-mono text-[11px] text-center bg-slate-50/50 select-none">
                        {(currentPage - 1) * pageSize + idx + 1}
                      </td>
                      {(role === 'ADMIN1' || role === 'SUPER_ADMIN' || role === 'ADMIN') && (
                        <td className="px-2.5 py-1.5 whitespace-nowrap text-center bg-slate-50/50">
                          <input 
                            type="checkbox" 
                            className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer w-3.5 h-3.5"
                            checked={selectedTickets.has(t.id)}
                            onChange={(e) => {
                              const newSelected = new Set(selectedTickets);
                              if (e.target.checked) {
                                newSelected.add(t.id);
                              } else {
                                newSelected.delete(t.id);
                              }
                              setSelectedTickets(newSelected);
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>
                      )}
                      {activeTab === 'ALL_TICKETS' && (allTicketsSubTab === 'MISSED' || allTicketsSubTab === 'DANGER_ZONE') ? (
                        <>
                          <td className="px-3.5 py-1.5 whitespace-nowrap text-[11px] text-slate-600">{t.departure_date ? new Date(t.departure_date).toLocaleDateString() : '-'}</td>
                          <td className="px-3.5 py-1.5 w-40 min-w-[160px] max-w-[185px] whitespace-normal break-words text-[11px] text-slate-600">
                            {
                              Array.isArray(t.project_ids) && t.project_ids.length > 0
                                ? t.project_ids.map((id: string) => allProjects.find(p => p.id === id)?.name || id).join(', ')
                                : (allProjects.find(p => p.id === t.project_id)?.name || t.project_id || '-')
                            }
                          </td>
                          <td className="px-3.5 py-1.5 w-44 min-w-[176px] max-w-[200px] whitespace-normal">
                            <div className="flex items-start space-x-1.5 font-semibold text-slate-900 text-[11.5px] leading-tight break-words">
                              <span className="relative flex h-1.5 w-1.5 mt-1 shrink-0">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-650"></span>
                              </span>
                              <span>{t.passenger_name}</span>
                            </div>
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap text-slate-700 font-mono font-medium text-[11px]">{t.pp_number || '-'}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap text-[11px] text-slate-600">{t.job_category || '-'}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap text-[11px] text-slate-600">{t.company || '-'}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap text-[11px] text-slate-600">{t.ticket_arranged_date ? new Date(t.ticket_arranged_date).toLocaleDateString() : '-'}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap text-[11px] text-slate-600">
                            {t.approved_rate ? `${t.approved_rate.toLocaleString()}` : '-'}
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap text-[11px] text-slate-600">{t.travel_agent || '-'}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap text-[11px] text-slate-600">{t.rescheduled_ticket_date ? new Date(t.rescheduled_ticket_date).toLocaleDateString() : '-'}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap text-[11px] text-slate-600">
                            {t.rescheduled_ticket_amount ? `${t.rescheduled_ticket_amount.toLocaleString()}` : '-'}
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap text-[11px] text-slate-600">{t.rescheduled_ticket_agent || '-'}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap text-[11px] text-slate-600">
                            {t.rescheduled_departure_date ? (
                              <div>
                                <div>{new Date(t.rescheduled_departure_date).toLocaleDateString()}</div>
                                <div className="text-[10px] font-semibold text-orange-600">{t.rescheduled_flight_status || 'PENDING'}</div>
                              </div>
                            ) : (t.flight_status || '-')}
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap text-right text-xs font-medium">
                            <div className="flex justify-end items-center space-x-3">
                              {role !== 'FINANCE' && t.status !== 'COMPLETED' && (() => {
                                const isDeparted = t.flight_status === 'DEPARTED' || t.rescheduled_flight_status === 'DEPARTED';
                                const isDisabled = isDeparted && role !== 'ADMIN' && role !== 'ADMIN1';
                                return (
                                  <button 
                                    type="button"
                                    disabled={isDisabled}
                                    onClick={(e) => { e.stopPropagation(); setFlightUpdateTicket(t); }} 
                                    className={`px-1.5 py-0.5 rounded inline-flex items-center border text-[10px] focus:outline-none focus:ring-1 transition-all duration-150 ${
                                      isDisabled 
                                        ? "opacity-50 cursor-not-allowed bg-slate-100 border-slate-200 text-slate-400 font-semibold" 
                                        : "text-amber-700 hover:text-amber-900 font-bold bg-amber-50 border-amber-200 focus:ring-amber-500"
                                    }`}
                                    aria-label={`Update Flight status for ${t.passenger_name}`}
                                  >
                                    Update Flight
                                  </button>
                                );
                              })()}
                              <button 
                                type="button"
                                onClick={(e) => { e.stopPropagation(); navigate(`/tickets/${t.id}`); }} 
                                className="text-sky-600 hover:text-sky-900 focus:outline-none focus:ring-1 focus:ring-sky-500 rounded px-1.5 py-0.5 text-[10px] font-semibold border border-sky-100 bg-sky-50"
                                aria-label={`View or Edit ticket for ${t.passenger_name}`}
                              >
                                View / Edit
                              </button>
                            </div>
                          </td>
                        </>
                      ) : activeTab === 'ALL_TICKETS' && allTicketsSubTab === 'NO_ISSUE' ? (
                        <>
                          {(visibleColumns.passenger_name ?? true) && (
                            <td className="px-3.5 py-1.5 w-44 min-w-[176px] max-w-[200px] whitespace-normal">
                              <div className="font-semibold text-slate-900 text-[11.5px] leading-tight break-words">{t.passenger_name}</div>
                            </td>
                          )}
                          {(visibleColumns.pp_number ?? true) && (
                            <td className="px-3.5 py-1.5 whitespace-nowrap text-slate-600 text-[11px]">{t.pp_number}</td>
                          )}
                          
                          {/* Attached image(s) column */}
                          {(visibleColumns.attached_images ?? true) && (
                            <td className="px-3.5 py-1.5 whitespace-nowrap">
                              <div className="flex items-center space-x-2">
                                {getTicketDocuments(t).length > 0 ? (
                                  <div className="flex -space-x-1 overflow-hidden">
                                    {getTicketDocuments(t).map((doc, idx) => (
                                      <div 
                                        key={idx} 
                                        className="relative group w-6.5 h-6.5 rounded-md border border-slate-200 overflow-hidden shadow-sm hover:z-10 hover:scale-110 cursor-pointer transition-transform bg-slate-50 flex items-center justify-center animate-fade-in" 
                                        onClick={(e) => { e.stopPropagation(); setLightboxImage(doc.url); }}
                                        title={doc.label}
                                      >
                                        {isWebUrl(doc.url) ? (
                                          <div className="w-full h-full bg-sky-500/5 flex flex-col items-center justify-center">
                                            <ExternalLink className="w-3 h-3 text-sky-600" />
                                            <span className="text-[4px] font-extrabold text-sky-600 uppercase block leading-none">WEB</span>
                                          </div>
                                        ) : isPdfUrl(doc.url) ? (
                                          <div className="w-full h-full bg-red-500/5 flex flex-col items-center justify-center">
                                            <FileText className="w-3 h-3 text-red-500" />
                                            <span className="text-[4px] font-extrabold text-red-600 uppercase block leading-none">PDF</span>
                                          </div>
                                        ) : (
                                          <div className="w-full h-full bg-slate-100 flex flex-col items-center justify-center">
                                            <File className="w-3 h-3 text-slate-500" />
                                          </div>
                                        )}
                                        <span className="absolute bottom-0 right-0 max-w-[18px] bg-slate-800/80 text-[4px] font-sans text-white px-px py-0 uppercase truncate rounded rounded-r-none font-semibold select-none">{doc.label}</span>
                                        {/* Mini delete on hover - only for general attachments, or structured if admin/agent */}
                                        {doc.type === 'generic' ? (
                                          <button
                                            type="button"
                                            className="absolute inset-0 bg-red-650/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                            title={`Delete ${doc.label}`}
                                            onClick={async (e) => {
                                              e.stopPropagation();
                                              if (doc.idx !== undefined) {
                                                await handleImageDelete(t.id, doc.idx);
                                              }
                                            }}
                                          >
                                            <X className="w-2.5 h-2.5" />
                                          </button>
                                        ) : (
                                          ['ADMIN', 'ADMIN1', 'AGENT', 'FINANCE'].includes(role) && (
                                            <button
                                              type="button"
                                              className="absolute inset-0 bg-red-650/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                              title={`Delete ${doc.label}`}
                                              onClick={async (e) => {
                                                e.stopPropagation();
                                                if (!window.confirm(`Delete this attached ${doc.label}?`)) return;
                                                try {
                                                  await api.put(`/tickets/${t.id}/documents`, { [doc.field || doc.type]: '' });
                                                  toast.success(`${doc.label} removed`);
                                                  fetchData();
                                                } catch (err) {
                                                  toast.error('Failed to remove document');
                                                }
                                              }}
                                            >
                                              <X className="w-2.5 h-2.5" />
                                            </button>
                                          )
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-slate-400 text-[10.5px] italic flex items-center select-none">
                                    <Image className="w-3 h-3 mr-1 opacity-60" /> None
                                  </div>
                                )}
                                <button 
                                  type="button" 
                                  className="p-0.5 rounded-md border border-slate-200 hover:border-sky-500 hover:bg-sky-50 text-slate-500 hover:text-sky-600 transition-colors" 
                                  title="Attach scan/image"
                                  onClick={(e) => { e.stopPropagation(); setUploadTicketId(t.id); }}
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            </td>
                          )}

                          {(visibleColumns.project_id ?? true) && (
                            <td className="px-3.5 py-1.5 w-40 min-w-[160px] max-w-[185px] whitespace-normal break-words text-slate-600 text-[11px]">
                              {
                                Array.isArray(t.project_ids) && t.project_ids.length > 0
                                  ? t.project_ids.map((id: string) => allProjects.find(p => p.id === id)?.name || id).join(', ')
                                  : (allProjects.find(p => p.id === t.project_id)?.name || t.project_id || '-')
                              }
                            </td>
                          )}
                          {(visibleColumns.route ?? true) && (
                            <td className="px-3.5 py-1.5 whitespace-nowrap text-slate-600 text-[11px] font-mono">{t.route || '-'}</td>
                          )}
                          {(visibleColumns.ticketing_agency ?? true) && (
                            <td className="px-3.5 py-1.5 whitespace-nowrap text-slate-700 text-[11px] font-medium">{t.travel_agent || '-'}</td>
                          )}
                          {(visibleColumns.approved_cost ?? true) && (
                            <td className="px-3.5 py-1.5 whitespace-nowrap text-slate-600 text-[11px]">
                              {!!(t.rescheduled_departure_date || t.other_invoice_number) ? (
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-1">
                                    <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1 rounded leading-none py-0.5" title="Original Ticket Approved Cost">1st</span>
                                    <span className="text-slate-600 font-medium">${Number(t.approved_rate || t.price || 0).toLocaleString()}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-[9px] font-bold text-orange-600 bg-orange-50 px-1 rounded leading-none py-0.5" title="Rescheduled Ticket Approved Cost">2nd</span>
                                    <span className="text-slate-800 font-bold">${Number(t.rescheduled_ticket_amount || 0).toLocaleString()}</span>
                                  </div>
                                </div>
                              ) : (
                                t.approved_rate ? `$${Number(t.approved_rate).toLocaleString()}` : '-'
                              )}
                            </td>
                          )}
                          {(visibleColumns.invoice_details ?? true) && (
                            <td className="px-3.5 py-1.5 whitespace-nowrap text-slate-600 text-[11px]">
                              {!!(t.rescheduled_departure_date || t.other_invoice_number) ? (
                                <div className="flex flex-col gap-1">
                                  {(t.invoice_number || t.first_invoice_number) ? (
                                    <div className="flex items-start gap-1">
                                      <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1 rounded leading-none mt-0.5" title="Original Invoice">1st</span>
                                      <div>
                                        <span className="font-mono text-slate-600 text-[11px] block leading-none">{t.invoice_number || t.first_invoice_number}</span>
                                        {(t.invoice_amount || t.first_invoice_amount) && (
                                          <span className="text-[10px] text-slate-500">${Number(t.invoice_amount || t.first_invoice_amount).toLocaleString()}</span>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1 text-slate-400 italic text-[10px]">
                                      <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1 rounded leading-none">1st</span>
                                      -
                                    </div>
                                  )}
                                  {t.other_invoice_number ? (
                                    <div className="flex items-start gap-1">
                                      <span className="text-[9px] font-bold text-orange-600 bg-orange-50 px-1 rounded leading-none mt-0.5" title="Rescheduled Invoice">2nd</span>
                                      <div>
                                        <span className="font-mono text-slate-800 font-semibold text-[11px] block leading-none">{t.other_invoice_number}</span>
                                        {t.rescheduled_ticket_amount && (
                                          <span className="text-[10px] text-orange-600 font-medium">${Number(t.rescheduled_ticket_amount).toLocaleString()}</span>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1 text-amber-700 font-extrabold text-[10px]">
                                      <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1 rounded leading-none">2nd</span>
                                      Pending Invoice
                                    </div>
                                  )}
                                  {t.po_status === 'payment done' && (
                                    <span className="inline-flex items-center w-fit px-1.5 py-0.25 rounded text-[9px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase tracking-wide mt-0.5">
                                      ✓ Paid
                                    </span>
                                  )}
                                </div>
                              ) : (
                                t.invoice_number || t.first_invoice_number ? (
                                  <div>
                                    <span className="font-mono text-slate-800">{t.invoice_number || t.first_invoice_number}</span>
                                    {(t.invoice_amount || t.first_invoice_amount) && (
                                      <span className="block text-[10px] text-slate-500">${Number(t.invoice_amount || t.first_invoice_amount).toLocaleString()}</span>
                                    )}
                                    {t.po_status === 'payment done' && (
                                      <span className="inline-flex items-center px-1.5 py-0.25 rounded text-[9px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-100 mt-0.5 uppercase tracking-wide">
                                        ✓ Paid
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200 uppercase tracking-wide leading-none">
                                    ⚠ Pending Invoice
                                  </span>
                                )
                              )}
                            </td>
                          )}
                          {(visibleColumns.po_number ?? true) && (
                            <td className="px-3.5 py-1.5 whitespace-nowrap text-slate-600 text-[11px] font-mono">
                              {!!(t.rescheduled_departure_date || t.other_invoice_number) ? (
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-1">
                                    <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1 rounded leading-none py-0.5" title="Original PO">1st</span>
                                    <span className="font-mono text-slate-600">{t.po_number || 'Pending'}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-[9px] font-bold text-orange-600 bg-orange-50 px-1 rounded leading-none py-0.5" title="Rescheduled PO">2nd</span>
                                    <span className="font-mono text-slate-800 font-semibold">{t.other_po_number || 'Pending'}</span>
                                  </div>
                                  {t.po_status === 'payment done' && (
                                    <span className="block text-[9px] font-black uppercase text-emerald-700 bg-emerald-50 px-1 py-0.25 rounded border border-emerald-200 w-fit leading-none mt-0.5">Paid</span>
                                  )}
                                </div>
                              ) : (
                                <div>
                                  <span>{t.po_number || '-'}</span>
                                  {t.po_status === 'payment done' && (
                                    <span className="block text-[9px] font-black uppercase text-emerald-700 bg-emerald-50 px-1 py-0.25 rounded border border-emerald-200 mt-0.5 w-fit">Paid</span>
                                  )}
                                </div>
                              )}
                            </td>
                          )}
                          {(visibleColumns.status ?? true) && (
                            <td className="px-3.5 py-1.5 whitespace-nowrap">
                              {renderStatusBadge(t.status)}
                            </td>
                          )}
                          {(visibleColumns.flight_status ?? true) && (
                            <td className="px-3.5 py-1.5 whitespace-nowrap text-slate-600 text-[11px]">
                              {renderFlightStatusBadge(t.flight_status, t.departure_date)}
                            </td>
                          )}
                          {(visibleColumns.workflow ?? true) && (
                            <td className="px-3.5 py-1.5 whitespace-nowrap">
                              <TicketProgressBar ticket={t} />
                            </td>
                          )}
                          <td className="px-3.5 py-1.5 whitespace-nowrap text-right text-xs font-medium">
                            <div className="flex justify-end items-center space-x-3">
                              <button 
                                type="button"
                                onClick={(e) => { e.stopPropagation(); navigate(`/tickets/${t.id}`); }} 
                                className="text-sky-600 hover:text-sky-900 focus:outline-none focus:ring-2 focus:ring-sky-500 rounded px-2 py-1"
                                aria-label={`View or Edit ticket for ${t.passenger_name}`}
                              >
                                View / Edit
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          {(visibleColumns.passenger_name ?? true) && (
                            <td className="px-3.5 py-1.5 w-44 min-w-[176px] max-w-[200px] whitespace-normal">
                              <div className="flex items-start space-x-1.5 font-semibold text-slate-900 text-[11.5px] leading-tight break-words">
                                {(t.flight_status === 'NO_SHOW' || t.rescheduled_flight_status === 'NO_SHOW') && (
                                  <span className="relative flex h-1.5 w-1.5 mt-1 shrink-0" title="No Show / Missed flight warning!">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-650"></span>
                                  </span>
                                )}
                                <span>{t.passenger_name}</span>
                              </div>
                            </td>
                          )}
                          {(visibleColumns.pp_number ?? true) && (
                            <td className="px-3.5 py-1.5 whitespace-nowrap text-slate-600 text-[11px]">{t.pp_number}</td>
                          )}
                          {(visibleColumns.project_id ?? true) && (
                            <td className="px-3.5 py-1.5 w-40 min-w-[160px] max-w-[185px] whitespace-normal break-words text-slate-600 text-[11px]">
                               {
                                 Array.isArray(t.project_ids) && t.project_ids.length > 0
                                   ? t.project_ids.map((id: string) => allProjects.find(p => p.id === id)?.name || id).join(', ')
                                   : (allProjects.find(p => p.id === t.project_id)?.name || t.project_id || '-')
                               }
                            </td>
                          )}
                          {(visibleColumns.route ?? true) && (
                            <td className="px-1 py-1.5 whitespace-nowrap text-slate-600 text-[11px] font-mono">{t.route || '-'}</td>
                          )}
                          {(visibleColumns.ticketing_agency ?? true) && (
                            <td className="px-1 py-1.5 whitespace-nowrap text-slate-700 text-[11px] font-medium">{t.travel_agent || '-'}</td>
                          )}
                          {(visibleColumns.approved_cost ?? true) && (
                            <td className="px-3.5 py-1.5 whitespace-nowrap text-slate-600 text-[11px]">
                              {!!(t.rescheduled_departure_date || t.other_invoice_number) ? (
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-1">
                                    <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1 rounded leading-none py-0.5" title="Original Ticket Approved Cost">1st</span>
                                    <span className="text-slate-600 font-medium">${Number(t.approved_rate || t.price || 0).toLocaleString()}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-[9px] font-bold text-orange-600 bg-orange-50 px-1 rounded leading-none py-0.5" title="Rescheduled Ticket Approved Cost">2nd</span>
                                    <span className="text-slate-800 font-bold">${Number(t.rescheduled_ticket_amount || 0).toLocaleString()}</span>
                                  </div>
                                </div>
                              ) : (
                                t.approved_rate ? `$${Number(t.approved_rate).toLocaleString()}` : '-'
                              )}
                            </td>
                          )}
                          {(visibleColumns.invoice_details ?? true) && (
                            <td className="px-3.5 py-1.5 whitespace-nowrap text-slate-600 text-[11px]">
                              {!!(t.rescheduled_departure_date || t.other_invoice_number) ? (
                                <div className="flex flex-col gap-1">
                                  {(t.invoice_number || t.first_invoice_number) ? (
                                    <div className="flex items-start gap-1">
                                      <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1 rounded leading-none mt-0.5" title="Original Invoice">1st</span>
                                      <div>
                                        <span className="font-mono text-slate-600 text-[11px] block leading-none">{t.invoice_number || t.first_invoice_number}</span>
                                        {(t.invoice_amount || t.first_invoice_amount) && (
                                          <span className="text-[10px] text-slate-500">${Number(t.invoice_amount || t.first_invoice_amount).toLocaleString()}</span>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1 text-slate-400 italic text-[10px]">
                                      <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1 rounded leading-none">1st</span>
                                      -
                                    </div>
                                  )}
                                  {t.other_invoice_number ? (
                                    <div className="flex items-start gap-1">
                                      <span className="text-[9px] font-bold text-orange-600 bg-orange-50 px-1 rounded leading-none mt-0.5" title="Rescheduled Invoice">2nd</span>
                                      <div>
                                        <span className="font-mono text-slate-800 font-semibold text-[11px] block leading-none">{t.other_invoice_number}</span>
                                        {t.rescheduled_ticket_amount && (
                                          <span className="text-[10px] text-orange-600 font-medium">${Number(t.rescheduled_ticket_amount).toLocaleString()}</span>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1 text-amber-700 font-extrabold text-[10px]">
                                      <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1 rounded leading-none">2nd</span>
                                      Pending Invoice
                                    </div>
                                  )}
                                  {t.po_status === 'payment done' && (
                                    <span className="inline-flex items-center w-fit px-1.5 py-0.25 rounded text-[9px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase tracking-wide mt-0.5">
                                      ✓ Paid
                                    </span>
                                  )}
                                </div>
                              ) : (
                                t.invoice_number || t.first_invoice_number ? (
                                  <div>
                                    <span className="font-mono text-slate-800">{t.invoice_number || t.first_invoice_number}</span>
                                    {(t.invoice_amount || t.first_invoice_amount) && (
                                      <span className="block text-[10px] text-slate-500">${Number(t.invoice_amount || t.first_invoice_amount).toLocaleString()}</span>
                                    )}
                                    {t.po_status === 'payment done' && (
                                      <span className="inline-flex items-center px-1.5 py-0.25 rounded text-[9px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-100 mt-0.5 uppercase tracking-wide">
                                        ✓ Paid
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200 uppercase tracking-wide leading-none">
                                    ⚠ Pending Invoice
                                  </span>
                                )
                              )}
                            </td>
                          )}
                          {(visibleColumns.po_number ?? true) && (
                            <td className="px-3.5 py-1.5 whitespace-nowrap text-slate-600 text-[11px] font-mono">
                              {!!(t.rescheduled_departure_date || t.other_invoice_number) ? (
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-1">
                                    <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1 rounded leading-none py-0.5" title="Original PO">1st</span>
                                    <span className="font-mono text-slate-600">{t.po_number || 'Pending'}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-[9px] font-bold text-orange-600 bg-orange-50 px-1 rounded leading-none py-0.5" title="Rescheduled PO">2nd</span>
                                    <span className="font-mono text-slate-800 font-semibold">{t.other_po_number || 'Pending'}</span>
                                  </div>
                                  {t.po_status === 'payment done' && (
                                    <span className="block text-[9px] font-black uppercase text-emerald-700 bg-emerald-50 px-1 py-0.25 rounded border border-emerald-200 w-fit leading-none mt-0.5">Paid</span>
                                  )}
                                </div>
                              ) : (
                                <div>
                                  <span>{t.po_number || '-'}</span>
                                  {t.po_status === 'payment done' && (
                                    <span className="block text-[9px] font-black uppercase text-emerald-700 bg-emerald-50 px-1 py-0.25 rounded border border-emerald-200 mt-0.5 w-fit">Paid</span>
                                  )}
                                </div>
                              )}
                            </td>
                          )}
                          {(visibleColumns.status ?? true) && (
                            <td className="px-3.5 py-1.5 whitespace-nowrap">
                              {renderStatusBadge(t.status)}
                            </td>
                          )}
                          {(visibleColumns.flight_status ?? true) && (
                            <td className="px-3.5 py-1.5 whitespace-nowrap">
                              {renderFlightStatusBadge(t.flight_status, t.departure_date)}
                            </td>
                          )}
                          {(visibleColumns.workflow ?? true) && (
                            <td className="px-3.5 py-1.5 whitespace-nowrap">
                              <TicketProgressBar ticket={t} />
                            </td>
                          )}
                          <td className="px-3.5 py-1.5 whitespace-nowrap text-right text-xs font-medium">
                            <div className="flex justify-end items-center space-x-3">
                              {role !== 'FINANCE' && t.status !== 'COMPLETED' && (() => {
                                const isDeparted = t.flight_status === 'DEPARTED' || t.rescheduled_flight_status === 'DEPARTED';
                                const isDisabled = isDeparted && role !== 'ADMIN' && role !== 'ADMIN1';
                                return (
                                  <button 
                                    type="button"
                                    disabled={isDisabled}
                                    onClick={(e) => { e.stopPropagation(); setFlightUpdateTicket(t); }} 
                                    className={`px-1.5 py-0.5 rounded inline-flex items-center border text-[10px] focus:outline-none focus:ring-1 transition-all duration-150 ${
                                      isDisabled 
                                        ? "opacity-50 cursor-not-allowed bg-slate-100 border-slate-200 text-slate-400 font-semibold" 
                                        : "text-amber-700 hover:text-amber-900 font-bold bg-amber-50 border-amber-200 focus:ring-amber-500"
                                    }`}
                                    aria-label={`Update Flight status for ${t.passenger_name}`}
                                  >
                                    Update Flight
                                  </button>
                                );
                              })()}

                              {role === 'FINANCE' && activeTab === 'ALL_TICKETS' && (allTicketsSubTab === 'UPDATE_REQUIRED' || (allTicketsSubTab === 'DANGER_ZONE' && t.rescheduled_departure_date && t.rescheduled_departure_date < format(new Date(), 'yyyy-MM-dd') && (!t.rescheduled_flight_status || t.rescheduled_flight_status === 'PENDING'))) && (
                                <button 
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); navigate(`/tickets/${t.id}`); }} 
                                  className="text-emerald-700 hover:text-emerald-900 font-bold bg-emerald-50 px-1.5 py-0.5 rounded inline-flex items-center border border-emerald-200 text-[10px] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                  aria-label={`Update ERP for ${t.passenger_name}`}
                                >
                                  Update ERP
                                </button>
                              )}

                              <button 
                                type="button"
                                onClick={(e) => { e.stopPropagation(); navigate(`/tickets/${t.id}`); }} 
                                className="text-sky-600 hover:text-sky-900 focus:outline-none focus:ring-1 focus:ring-sky-500 rounded px-1.5 py-0.5 text-[10px] font-semibold border border-sky-100 bg-sky-50"
                                aria-label={`View or Edit ticket for ${t.passenger_name}`}
                              >
                                View / Edit
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                    {expandedTicketId === t.id && activeTab === 'ALL_TICKETS' && (allTicketsSubTab === 'MISSED' || allTicketsSubTab === 'DANGER_ZONE') && (
                      <tr>
                        <td colSpan={15} className="bg-slate-50 border-b border-slate-200">
                          <div className="p-6 space-y-6">
                            {/* First Attempt Section */}
                            <div className="bg-white rounded-lg p-4 shadow-sm border border-slate-200">
                              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">First Attempt</h4>
                              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm text-slate-700">
                                <div>
                                  <strong className="block text-slate-500 text-xs uppercase tracking-wider mb-1">PO Number</strong>
                                  {t.po_number || '-'}
                                </div>
                                <div>
                                  <strong className="block text-slate-500 text-xs uppercase tracking-wider mb-1">Invoice Number</strong>
                                  {t.invoice_number || '-'}
                                </div>
                                <div>
                                  <strong className="block text-slate-500 text-xs uppercase tracking-wider mb-1">Invoice Amount</strong>
                                  {t.invoice_amount ? (t.currency === 'LKR' ? `LKR ${t.invoice_amount.toLocaleString()}` : `$${t.invoice_amount.toLocaleString()}`) : '-'}
                                </div>
                                <div>
                                  <strong className="block text-slate-500 text-xs uppercase tracking-wider mb-1">PO Status</strong>
                                  {t.po_status || '-'}
                                </div>
                              </div>
                            </div>

                            {/* Rescheduled Attempt Section */}
                            {t.rescheduled_departure_date && (
                              <div className="bg-white rounded-lg p-4 shadow-sm border border-sky-200">
                                <h4 className="text-xs font-bold text-sky-600 uppercase tracking-wider mb-3">Rescheduled Attempt</h4>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm text-slate-700">
                                  <div>
                                    <strong className="block text-slate-500 text-xs uppercase tracking-wider mb-1">Rescheduled PO Number</strong>
                                    {t.rescheduled_po_number || '-'}
                                  </div>
                                  <div>
                                    <strong className="block text-slate-500 text-xs uppercase tracking-wider mb-1">Rescheduled Invoice Number</strong>
                                    {t.rescheduled_invoice_number || '-'}
                                  </div>
                                  <div>
                                    <strong className="block text-slate-500 text-xs uppercase tracking-wider mb-1">Rescheduled Amount</strong>
                                    {t.rescheduled_ticket_amount ? (t.currency === 'LKR' ? `LKR ${t.rescheduled_ticket_amount.toLocaleString()}` : `$${t.rescheduled_ticket_amount.toLocaleString()}`) : '-'}
                                  </div>
                                  <div>
                                    <strong className="block text-slate-500 text-xs uppercase tracking-wider mb-1">Rescheduled PO Status</strong>
                                    {t.rescheduled_po_status || '-'}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* General Details Section */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-sm text-slate-700">
                              <div>
                                <strong className="block text-slate-500 text-xs uppercase tracking-wider mb-1">Passport Number</strong>
                                {t.pp_number || '-'}
                              </div>
                              <div>
                                <strong className="block text-slate-500 text-xs uppercase tracking-wider mb-1">Route</strong>
                                {t.route || '-'}
                              </div>
                              <div>
                                <strong className="block text-slate-500 text-xs uppercase tracking-wider mb-1">Ticket Type</strong>
                                {t.ticket_type || '-'}
                              </div>
                              <div>
                                <strong className="block text-slate-500 text-xs uppercase tracking-wider mb-1">Arrival Date</strong>
                                {t.arrival_date ? new Date(t.arrival_date).toLocaleDateString() : '-'}
                              </div>
                              <div className="md:col-span-4">
                                <strong className="block text-slate-500 text-xs uppercase tracking-wider mb-1">Notes / Remarks</strong>
                                {t.notes || <span className="text-slate-400 italic">No notes added.</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
            {sortedTickets.length > pageSize && (
              <div className="px-6 py-3 border-t border-slate-200 flex items-center justify-between bg-slate-50">
                <div className="text-xs text-slate-500">
                  Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, sortedTickets.length)} of {sortedTickets.length}
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    className="px-3 py-1 text-xs border border-slate-300 rounded hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >Prev</button>
                  <span className="text-xs text-slate-700">Page {currentPage} of {totalPages}</span>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    className="px-3 py-1 text-xs border border-slate-300 rounded hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >Next</button>
                </div>
              </div>
            )}
        </div>
      </div>
        )}
        {activeTab === 'NEW_TICKET' && (
          <div className="max-w-4xl mx-auto">
            <NewTicketModal 
              isEmbedded
              projects={allProjects} 
              tickets={tickets}
              onSuccess={() => {
                fetchData();
                setActiveTab('ALL_TICKETS');
              }} 
            />
          </div>
        )}

        {showAdminAuthModal && (
          <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-800">Admin Authorization</h3>
                <button 
                  onClick={() => setShowAdminAuthModal(false)}
                  className="text-slate-400 hover:text-slate-600 transition-colors focus:outline-none"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-slate-500 mb-2">
                  Please enter a Master Admin credentials to authorize deleting {selectedTickets.size} ticket(s).
                </p>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Admin Email</label>
                  <input
                    type="email"
                    className="w-full border-slate-200 rounded-md text-sm focus:border-sky-500 focus:ring-sky-500"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="master@admin.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Admin Password</label>
                  <input
                    type="password"
                    className="w-full border-slate-200 rounded-md text-sm focus:border-sky-500 focus:ring-sky-500"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
              </div>
              <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowAdminAuthModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-md hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  disabled={!adminEmail || !adminPassword}
                  className="px-4 py-2 text-sm font-medium text-white bg-rose-600 border border-transparent rounded-md hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Confirm Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'PO_STATUS_DASHBOARD' && (
          <div className="w-full">
            <PoStatusDashboard 
              tickets={tickets}
              allProjects={allProjects}
              fetchData={fetchData}
              role={role}
            />
          </div>
        )}

        {activeTab === 'FINANCE_BULK_PO' && (() => {
          const invoiceGroups: {
            [groupKey: string]: {
              group_key: string;
              invoice_number: string;
              po_number: string;
              occurred_date: string | null;
              tickets: any[];
            };
          } = {};

          const getTicketCost = (t: any) => {
            if (t.invoice_type === 'other') {
              return Number(t.other_invoice_amount) || Number(t.rescheduled_ticket_amount) || Number(t.approved_rate) || 0;
            }
            return Number(t.invoice_amount) || Number(t.approved_rate) || 0;
          };

          tickets.forEach(ticket => {
            if (ticket.first_invoice_number && ticket.first_invoice_number.trim()) {
              const invNo = ticket.first_invoice_number.trim();
              const groupKey = invNo;
              if (!invoiceGroups[groupKey]) {
                invoiceGroups[groupKey] = {
                  group_key: groupKey,
                  invoice_number: invNo,
                  po_number: ticket.po_number || '',
                  occurred_date: ticket.ticket_arranged_date || ticket.departure_date || null,
                  tickets: []
                };
              }
              if (!invoiceGroups[groupKey].tickets.some((t: any) => t.id === ticket.id && t.invoice_type === 'first')) {
                invoiceGroups[groupKey].tickets.push({
                  ...ticket,
                  invoice_type: 'first',
                  active_invoice_url: ticket.first_invoice,
                  active_atbf_url: ticket.first_atbf
                });
              }
              if (!invoiceGroups[groupKey].occurred_date) {
                invoiceGroups[groupKey].occurred_date = ticket.ticket_arranged_date || ticket.departure_date || null;
              }
              if (!invoiceGroups[groupKey].po_number && ticket.po_number) {
                invoiceGroups[groupKey].po_number = ticket.po_number;
              }
            }

            if (ticket.other_invoice_number && ticket.other_invoice_number.trim()) {
              const invNo = ticket.other_invoice_number.trim();
              const groupKey = invNo;
              if (!invoiceGroups[groupKey]) {
                invoiceGroups[groupKey] = {
                  group_key: groupKey,
                  invoice_number: invNo,
                  po_number: ticket.other_po_number || '',
                  occurred_date: ticket.rescheduled_ticket_date || ticket.rescheduled_departure_date || ticket.ticket_arranged_date || ticket.departure_date || null,
                  tickets: []
                };
              }
              if (!invoiceGroups[groupKey].tickets.some((t: any) => t.id === ticket.id && t.invoice_type === 'other')) {
                invoiceGroups[groupKey].tickets.push({
                  ...ticket,
                  invoice_type: 'other',
                  active_invoice_url: ticket.other_invoice,
                  active_atbf_url: ticket.first_atbf
                });
              }
              if (!invoiceGroups[groupKey].occurred_date) {
                invoiceGroups[groupKey].occurred_date = ticket.rescheduled_ticket_date || ticket.rescheduled_departure_date || ticket.ticket_arranged_date || ticket.departure_date || null;
              }
              if (!invoiceGroups[groupKey].po_number && ticket.other_po_number) {
                invoiceGroups[groupKey].po_number = ticket.other_po_number;
              }
            }
          });

          const getMonthLabel = (dateStr: string | null) => {
            if (!dateStr) return 'No Specified Month';
            try {
              const date = new Date(dateStr);
              if (isNaN(date.getTime())) return 'No Specified Month';
              return date.toLocaleString('default', { month: 'long', year: 'numeric' });
            } catch {
              return 'No Specified Month';
            }
          };

          const monthGroups: { [month: string]: typeof invoiceGroups[string][] } = {};

          Object.values(invoiceGroups).forEach(group => {
            const subTickets = group.tickets || [];

            // Extract unique active allocation units (projects and companies)
            const activeAllocationUnits: { id: string; name: string; type: 'project' | 'company' }[] = [];

            // Extract unique active project IDs
            const activePids = Array.from(
              new Set(
                subTickets
                  .filter((t: any) => {
                    const isProj = t.invoice_type === 'other' 
                      ? (!t.rescheduled_cost_allocation || t.rescheduled_cost_allocation === 'project') 
                      : (!t.cost_allocation || t.cost_allocation === 'project');
                    return isProj;
                  })
                  .flatMap((t: any) => {
                    if (Array.isArray(t.project_ids) && t.project_ids.length > 0) {
                      return t.project_ids;
                    }
                    return t.project_id ? [t.project_id] : [];
                  })
                  .filter(Boolean)
              )
            ) as string[];

            // Extract unique active company names
            const activeCompanies = Array.from(
              new Set(
                subTickets
                  .filter((t: any) => {
                    const isComp = t.invoice_type === 'other' 
                      ? t.rescheduled_cost_allocation === 'company' 
                      : t.cost_allocation === 'company';
                    return isComp;
                  })
                  .map((t: any) => t.company || 'Sanken Overseas')
                  .filter(Boolean)
              )
            ) as string[];

            activePids.forEach((pid: string) => {
              const proj = allProjects.find(p => p.id === pid);
              activeAllocationUnits.push({
                id: pid,
                name: proj?.name || pid,
                type: 'project'
              });
            });

            activeCompanies.forEach((comp: string) => {
              activeAllocationUnits.push({
                id: comp,
                name: comp,
                type: 'company'
              });
            });

            const groupExistingProjectPos: Record<string, string> = {};
            subTickets.forEach((t: any) => {
              const pos = t.invoice_type === 'other' ? t.other_project_pos : t.project_pos;
              if (pos && typeof pos === 'object') {
                Object.assign(groupExistingProjectPos, pos);
              }
            });

            const hasAllPOsAssigned = activeAllocationUnits.length > 0
              ? activeAllocationUnits.every(unit => {
                  const po = groupExistingProjectPos[unit.id];
                  return po && po.trim() !== '';
                })
              : (group.po_number && group.po_number.trim() !== '');

            if (hasAllPOsAssigned && !financeShowFullyAssigned) return;

            const filteredTickets = group.tickets.filter((t: any) => {
              const matchesAgent = financeAgentFilter === 'ALL' || t.travel_agent === financeAgentFilter;
              const matchesProject = financeProjectFilter === 'ALL' || t.project_id === financeProjectFilter;
              return matchesAgent && matchesProject;
            });

            if (filteredTickets.length === 0) return;

            const filteredGroup = {
              ...group,
              tickets: filteredTickets
            };

            const matchesSearch = !financeSearch.trim() || 
              filteredGroup.invoice_number.toLowerCase().includes(financeSearch.toLowerCase().trim()) ||
              filteredGroup.po_number.toLowerCase().includes(financeSearch.toLowerCase().trim()) ||
              filteredGroup.tickets.some((t: any) => 
                (t.passenger_name || '').toLowerCase().includes(financeSearch.toLowerCase().trim()) ||
                (t.pp_number || '').toLowerCase().includes(financeSearch.toLowerCase().trim())
              );

            if (!matchesSearch) return;

            const monthLabel = getMonthLabel(filteredGroup.occurred_date);
            if (!monthGroups[monthLabel]) {
              monthGroups[monthLabel] = [];
            }
            monthGroups[monthLabel].push(filteredGroup);
          });

          const sortedMonthKeys = Object.keys(monthGroups).sort((a, b) => {
            if (a === 'No Specified Month') return 1;
            if (b === 'No Specified Month') return -1;
            try {
              const dA = new Date(a);
              const dB = new Date(b);
              return dB.getTime() - dA.getTime();
            } catch {
              return 0;
            }
          });

          return (
            <div className="space-y-6">
              {/* Header Panel with Filters */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 bg-slate-100 rounded-full opacity-20 pointer-events-none animate-pulse"></div>
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 relative z-10 font-sans">
                  <div className="max-w-xl">
                    <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5 flex-wrap">
                      <div className="p-2.5 bg-slate-100/80 text-sky-500 rounded-xl border border-slate-200/40">
                        <FileText className="w-6 h-6" />
                      </div>
                      Invoice and PO management
                    </h2>
                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                      Verify individual passenger details, ATBF structures, and invoice files, then assign purchase orders (POs) in bulk. Filter records by travel agents or specific projects below.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-end gap-3 w-full xl:w-auto">
                    {/* Project Filter */}
                    <div className="flex flex-col min-w-[145px] w-full sm:w-auto">
                      <label htmlFor="finance-project-filter" className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">Project</label>
                      <select
                        id="finance-project-filter"
                        value={financeProjectFilter}
                        onChange={(e) => setFinanceProjectFilter(e.target.value)}
                        className="py-2.5 pl-3 pr-8 border border-slate-250 rounded-xl text-sm bg-slate-50 text-slate-800 font-semibold focus:ring-2 focus:ring-sky-500 outline-none hover:bg-slate-100/50 cursor-pointer"
                      >
                        <option value="ALL">All Projects</option>
                        {allProjects.map((p, idx) => (
                          <option key={p.id || `fin-proj-filt-${idx}`} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Agent Filter */}
                    <div className="flex flex-col min-w-[145px] w-full sm:w-auto">
                      <label htmlFor="finance-agent-filter" className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">Travel Agent</label>
                      <select
                        id="finance-agent-filter"
                        value={financeAgentFilter}
                        onChange={(e) => setFinanceAgentFilter(e.target.value)}
                        className="py-2.5 pl-3 pr-8 border border-slate-250 rounded-xl text-sm bg-slate-50 text-slate-800 font-semibold focus:ring-2 focus:ring-sky-500 outline-none hover:bg-slate-100/50 cursor-pointer"
                      >
                        <option value="ALL">All Agents</option>
                        {getFilteredOptions('TRAVEL_AGENT').map((opt, idx) => (
                          <option key={opt.id || `fin-agent-filt-${opt.value}-${idx}`} value={opt.value}>
                            {opt.value}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Search Field */}
                    <div className="flex flex-col w-full sm:w-64">
                      <label htmlFor="finance-search" className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">Search Invoices / Passengers</label>
                      <div className="relative">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                        <input 
                          id="finance-search"
                          type="search" 
                          value={financeSearch}
                          onChange={(e) => setFinanceSearch(e.target.value)}
                          placeholder="Search Invoices, POs, or passengers..." 
                          className="pl-10 pr-4 py-2.5 border border-slate-250 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 outline-none block w-full transition-all bg-slate-50 text-slate-800 font-semibold hover:bg-slate-100/50"
                        />
                      </div>
                    </div>

                    {/* Show Fully Assigned Toggle Checkbox */}
                    <div className="flex flex-col min-w-[155px] w-full sm:w-auto">
                      <label htmlFor="finance-show-assigned" className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">Fully Assigned POs</label>
                      <div className="flex items-center gap-2 h-[42px] px-3.5 border border-slate-250 rounded-xl bg-slate-50 hover:bg-slate-100/50 transition-all select-none cursor-pointer">
                        <input
                          id="finance-show-assigned"
                          type="checkbox"
                          checked={financeShowFullyAssigned}
                          onChange={(e) => setFinanceShowFullyAssigned(e.target.checked)}
                          className="w-4 h-4 text-sky-500 border-slate-300 rounded focus:ring-sky-500 cursor-pointer"
                        />
                        <span className="text-xs font-bold text-slate-700">Show Assigned</span>
                      </div>
                    </div>

                    {/* Clear Button */}
                    {(financeSearch || financeAgentFilter !== 'ALL' || financeProjectFilter !== 'ALL' || !financeShowFullyAssigned) && (
                      <button
                        type="button"
                        onClick={() => {
                          setFinanceSearch('');
                          setFinanceAgentFilter('ALL');
                          setFinanceProjectFilter('ALL');
                          setFinanceShowFullyAssigned(true);
                        }}
                        className="px-4 py-2.5 text-xs text-sky-600 hover:text-sky-700 hover:bg-sky-50 border border-sky-200 rounded-xl font-bold transition-all inline-flex items-center gap-1 cursor-pointer bg-white h-[42px] shrink-0 w-full sm:w-auto justify-center"
                      >
                        Reset Filters
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {sortedMonthKeys.length === 0 ? (
                <div className="bg-white py-16 text-center rounded-2xl border border-slate-200/60 text-slate-500 font-medium shadow-xs">
                  No invoices or records found matching your current filter.
                </div>
              ) : (
                sortedMonthKeys.map(month => (
                  <div key={month} className="space-y-4">
                    <div className="flex items-center gap-2 pt-2">
                      <span className="inline-flex items-center justify-center p-1.5 bg-slate-100 text-sky-500 rounded-lg text-sm border border-slate-200/40 shadow-2xs">🗓️</span>
                      <h3 className="text-sm font-bold text-slate-800">
                        Travel Occurred Month: <span className="text-sky-500 font-extrabold">{month}</span>
                      </h3>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-6">
                      {monthGroups[month].map((group, groupIdx) => {
                        const hasMissed = group.tickets.some(t => t.invoice_type === 'other' ? t.rescheduled_flight_status === 'NO_SHOW' : t.flight_status === 'NO_SHOW');
                        const isSaving = assigningPoForInvoice === group.invoice_number;
                        const currentPo = bulkPoNumbers[group.group_key] !== undefined 
                          ? bulkPoNumbers[group.group_key] 
                          : group.po_number;

                        const subTickets = group.tickets || [];
                        const firstTicketWithAtbf = subTickets.find((t: any) => t.active_atbf_url && t.active_atbf_url.trim());
                        const firstTicketWithInvoice = subTickets.find((t: any) => t.active_invoice_url && t.active_invoice_url.trim());
                        const groupAtbfUrl = firstTicketWithAtbf?.active_atbf_url || null;
                        const groupInvoiceUrl = firstTicketWithInvoice?.active_invoice_url || null;

                        const groupProjectIds = Array.from(
                          new Set(
                            subTickets
                              .flatMap((t: any) => {
                                if (Array.isArray(t.project_ids) && t.project_ids.length > 0) {
                                  return t.project_ids;
                                }
                                return t.project_id ? [t.project_id] : [];
                              })
                              .filter(Boolean)
                          )
                        ) as string[];

                        const groupExistingProjectPos: Record<string, string> = {};
                        subTickets.forEach((t: any) => {
                          const pos = t.invoice_type === 'other' ? t.other_project_pos : t.project_pos;
                          if (pos && typeof pos === 'object') {
                            Object.assign(groupExistingProjectPos, pos);
                          }
                        });

                        const linkedInvoices: {
                          invoiceNumber: string;
                          type: 'first' | 'other';
                          passengerName: string;
                        }[] = [];

                        subTickets.forEach((t: any) => {
                          if (t.invoice_type === 'first' && t.other_invoice_number && t.other_invoice_number.trim()) {
                            if (!linkedInvoices.some(l => l.invoiceNumber === t.other_invoice_number.trim())) {
                              linkedInvoices.push({
                                invoiceNumber: t.other_invoice_number.trim(),
                                type: 'other',
                                passengerName: t.passenger_name
                              });
                            }
                          } else if (t.invoice_type === 'other' && t.first_invoice_number && t.first_invoice_number.trim()) {
                            if (!linkedInvoices.some(l => l.invoiceNumber === t.first_invoice_number.trim())) {
                              linkedInvoices.push({
                                invoiceNumber: t.first_invoice_number.trim(),
                                type: 'first',
                                passengerName: t.passenger_name
                              });
                            }
                          }
                        });

                        const activeAllocationUnits: { id: string; name: string; type: 'project' | 'company' }[] = [];

                        // Extract unique active project IDs
                        const activePids = Array.from(
                          new Set(
                            subTickets
                              .filter((t: any) => {
                                const isProj = t.invoice_type === 'other' 
                                  ? (!t.rescheduled_cost_allocation || t.rescheduled_cost_allocation === 'project') 
                                  : (!t.cost_allocation || t.cost_allocation === 'project');
                                return isProj;
                              })
                              .flatMap((t: any) => {
                                if (Array.isArray(t.project_ids) && t.project_ids.length > 0) {
                                  return t.project_ids;
                                }
                                return t.project_id ? [t.project_id] : [];
                              })
                              .filter(Boolean)
                          )
                        ) as string[];

                        // Extract unique active company names
                        const activeCompanies = Array.from(
                          new Set(
                            subTickets
                              .filter((t: any) => {
                                const isComp = t.invoice_type === 'other' 
                                  ? t.rescheduled_cost_allocation === 'company' 
                                  : t.cost_allocation === 'company';
                                return isComp;
                              })
                              .map((t: any) => t.company || 'Sanken Overseas')
                              .filter(Boolean)
                          )
                        ) as string[];

                        activePids.forEach((pid: string) => {
                          const proj = allProjects.find(p => p.id === pid);
                          activeAllocationUnits.push({
                            id: pid,
                            name: proj?.name || pid,
                            type: 'project'
                          });
                        });

                        activeCompanies.forEach((comp: string) => {
                          activeAllocationUnits.push({
                            id: comp,
                            name: comp,
                            type: 'company'
                          });
                        });

                        const singleUnit = activeAllocationUnits[0];
                        let singleUnitTotalCost = 0;
                        if (singleUnit) {
                          if (singleUnit.type === 'project') {
                            const matchedTickets = subTickets.filter((t: any) => {
                              const isTickedProject = t.invoice_type === 'other'
                                ? (!t.rescheduled_cost_allocation || t.rescheduled_cost_allocation === 'project')
                                : (!t.cost_allocation || t.cost_allocation === 'project');
                              if (!isTickedProject) return false;
                              return Array.isArray(t.project_ids) 
                                ? t.project_ids.includes(singleUnit.id) 
                                : t.project_id === singleUnit.id;
                            });
                            singleUnitTotalCost = matchedTickets.reduce((sum: number, t: any) => sum + getTicketCost(t), 0);
                          } else if (singleUnit.type === 'company') {
                            const matchedTickets = subTickets.filter((t: any) => {
                              const isTickedCompany = t.invoice_type === 'other'
                                ? t.rescheduled_cost_allocation === 'company'
                                : t.cost_allocation === 'company';
                              if (!isTickedCompany) return false;
                              return (t.company || 'Sanken Overseas') === singleUnit.id;
                            });
                            singleUnitTotalCost = matchedTickets.reduce((sum: number, t: any) => sum + getTicketCost(t), 0);
                          }
                        }
                        const isLkrGroup = subTickets[0]?.currency === 'LKR';

                        const projectNamesWithPOs = Array.from(
                          new Set(
                            subTickets
                              .flatMap((t: any) => {
                                const isCompany = t.invoice_type === 'other' 
                                  ? t.rescheduled_cost_allocation === 'company' 
                                  : t.cost_allocation === 'company';
                                if (isCompany) {
                                  const compName = t.company || 'Sanken Overseas';
                                  const po = t.project_pos?.[compName] || t.po_number;
                                  return po ? `${compName} (PO: ${po})` : compName;
                                } else {
                                  if (Array.isArray(t.project_ids) && t.project_ids.length > 0) {
                                    return t.project_ids.map((id: string) => {
                                      const pName = allProjects.find(p => p.id === id)?.name || id;
                                      const po = t.project_pos?.[id];
                                      return po ? `${pName} (PO: ${po})` : pName;
                                    });
                                  }
                                  const n = allProjects.find(p => p.id === t.project_id)?.name || t.project_id;
                                  if (n) {
                                    const po = t.project_pos?.[t.project_id] || t.po_number;
                                    return po ? `${n} (PO: ${po})` : n;
                                  }
                                  return [];
                                }
                              })
                              .filter(Boolean)
                          )
                        ).join(', ') || 'No Cost Allocation';

                        const isExpanded = !!expandedInvoices[group.group_key];
                        const toggleExpand = () => {
                          setExpandedInvoices(prev => ({
                            ...prev,
                            [group.group_key]: !prev[group.group_key]
                          }));
                        };

                        return (
                          <div 
                            id={`invoice-group-${String(group.group_key).toLowerCase().trim()}`}
                            key={`${group.group_key}-${groupIdx}`} 
                            style={{ contentVisibility: 'auto' }}
                            className={`rounded-2xl border transition-all duration-300 overflow-hidden hover:border-slate-300/80 hover:shadow-md ${
                              hasMissed 
                                ? 'border-red-500/40 shadow-sm border-l-4 border-l-red-500 bg-red-50' 
                                : 'bg-white border-slate-200/60 shadow-2xs'
                            }`}
                          >
                            {/* Invoice Group Header */}
                            <div 
                              onClick={toggleExpand}
                              className={`p-4 border-b flex flex-col lg:flex-row lg:items-center justify-between gap-4 cursor-pointer select-none transition-colors duration-200 hover:bg-slate-50/50 ${
                                hasMissed ? 'bg-red-500/10 border-red-500/15' : 'bg-slate-100/40 border-slate-200/50'
                              }`}
                            >
                              <div className="flex flex-wrap items-center gap-4 md:gap-5 flex-1 select-none">
                                <div className="flex items-center gap-3 shrink-0">
                                  {/* Toggle Expand Icon Button */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleExpand();
                                    }}
                                    className="p-1.5 hover:bg-slate-200/80 rounded-xl text-slate-500 hover:text-slate-700 transition-colors cursor-pointer shrink-0 border border-slate-200 bg-white shadow-3xs"
                                    title={isExpanded ? "Collapse Passenger List" : "Expand Passenger List"}
                                  >
                                    <ChevronDown className={`w-4 h-4 text-slate-600 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                                  </button>

                                  {/* Invoice Card sequential number badge */}
                                  <div className="flex items-center justify-center w-8 h-8 bg-sky-50 text-sky-600 text-xs font-black rounded-xl border border-sky-100 shadow-2xs font-sans shrink-0 select-none">
                                    {groupIdx + 1}
                                  </div>
                                  <div className={`p-2.5 rounded-xl shrink-0 ${hasMissed ? 'bg-red-500/20 text-red-500' : 'bg-sky-500/10 text-sky-500'}`}>
                                    <FileText className="w-5 h-5" />
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] text-indigo-500 uppercase tracking-widest font-black">Invoice Reference</span>
                                    </div>
                                    <div className="text-base font-extrabold text-slate-950 tracking-tight flex flex-wrap items-center gap-2">
                                      <span className="font-sans font-black text-slate-900">Invoice: {group.invoice_number}</span>
                                      <span className="text-[10px] text-slate-500 font-mono bg-indigo-50 text-indigo-600 border border-indigo-200/50 px-1.5 py-0.5 rounded-md font-bold">
                                        {subTickets.length} {subTickets.length === 1 ? 'Passenger' : 'Passengers'}
                                      </span>
                                      {(() => {
                                        const { label, bgClass } = getGroupSummaryStatus(subTickets);
                                        return (
                                          <span className={`text-[10px] select-none font-sans font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md border ${bgClass}`}>
                                            {label}
                                          </span>
                                        );
                                      })()}
                                      {hasMissed && (
                                        <span className="text-[10px] bg-red-600 text-white border border-red-700 px-2 py-0.5 rounded-md font-extrabold animate-pulse inline-flex items-center gap-1 shrink-0 shadow-3xs">
                                          🚨 HAS NO-SHOW
                                        </span>
                                      )}
                                    </div>
                                    {isExpanded && (
                                      <div className="text-[11px] text-slate-500 font-medium mt-0.5 max-w-xl truncate" title={subTickets.map((t: any) => t.passenger_name).join(', ')}>
                                        Passengers: <span className="font-semibold text-slate-700">
                                          {subTickets.map((t: any, idx: number) => {
                                            const isNoShow = t.invoice_type === 'other' ? t.rescheduled_flight_status === 'NO_SHOW' : t.flight_status === 'NO_SHOW';
                                            return (
                                              <span key={`${t.id || 'psg'}-${idx}`}>
                                                <span className={isNoShow ? "text-red-500 font-black" : ""}>
                                                  {t.passenger_name}{isNoShow ? " (NO-SHOW)" : ""}
                                                </span>
                                                {idx < subTickets.length - 1 ? ", " : ""}
                                              </span>
                                            );
                                          })}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Group Document Shortcuts (Unified Actions in middle up) */}
                                <div onClick={(e) => e.stopPropagation()} className="flex flex-wrap items-center gap-2">
                                  {groupAtbfUrl && (
                                    <div className="inline-flex items-center rounded-xl bg-sky-500/10 border border-sky-500/20 p-0.5 shadow-2xs font-sans shrink-0">
                                      {isWebUrl(groupAtbfUrl) ? (
                                        <a
                                          href={groupAtbfUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-[11px] text-sky-700 hover:text-sky-850 hover:bg-sky-500/10 px-2.5 py-1 rounded-lg inline-flex items-center cursor-pointer transition-all font-bold gap-1"
                                          title="Open ATBF in New Tab"
                                        >
                                          <ExternalLink className="w-3 h-3 text-sky-500" />
                                          ATBF
                                        </a>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => setLightboxImage(groupAtbfUrl)}
                                          className="text-[11px] text-sky-700 hover:text-sky-800 hover:bg-sky-500/10 px-2.5 py-1 rounded-lg inline-flex items-center cursor-pointer transition-all font-bold gap-1"
                                          title="View ATBF"
                                        >
                                          <Eye className="w-3 h-3 text-sky-500" />
                                          ATBF
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => handleDownloadFile(groupAtbfUrl, `ATBF_${group.invoice_number}.pdf`)}
                                        className="p-1 hover:text-sky-600 text-slate-400 rounded transition-colors ml-0.5"
                                        title="Download ATBF"
                                      >
                                        <Download className="w-3 h-3" />
                                      </button>
                                    </div>
                                  )}

                                  {groupInvoiceUrl && (
                                    <div className="inline-flex items-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-0.5 shadow-2xs font-sans shrink-0">
                                      {isWebUrl(groupInvoiceUrl) ? (
                                        <a
                                          href={groupInvoiceUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-[11px] text-emerald-700 hover:text-emerald-850 hover:bg-emerald-500/10 px-2.5 py-1 rounded-lg inline-flex items-center cursor-pointer transition-all font-bold gap-1"
                                          title="Open INVOICE in New Tab"
                                        >
                                          <ExternalLink className="w-3 h-3 text-emerald-500" />
                                          INVOICE
                                        </a>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => setLightboxImage(groupInvoiceUrl)}
                                          className="text-[11px] text-emerald-700 hover:text-emerald-800 hover:bg-emerald-500/10 px-2.5 py-1 rounded-lg inline-flex items-center cursor-pointer transition-all font-bold gap-1"
                                          title="View INVOICE"
                                        >
                                          <Eye className="w-3 h-3 text-emerald-500" />
                                          INVOICE
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => handleDownloadFile(groupInvoiceUrl, `INVOICE_${group.invoice_number}.pdf`)}
                                        className="p-1 hover:text-emerald-600 text-slate-400 rounded transition-colors ml-0.5"
                                        title="Download INVOICE"
                                      >
                                        <Download className="w-3 h-3" />
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {/* Status & Info Labels Area with Flash animation */}
                                <div className="flex flex-wrap items-center gap-2.5">
                                  {hasMissed && (
                                    <span className="bg-red-100 text-red-700 text-[10px] uppercase font-black px-3 py-1 rounded-xl border border-red-200 tracking-wider inline-flex items-center gap-1.5 shrink-0 animate-pulse-glowing-red">
                                      ⚠️ Missed Flight
                                    </span>
                                  )}

                                  {/* Passenger Count Badge */}
                                  <span className="bg-sky-50 text-sky-700 text-[10px] uppercase font-black px-3 py-1 rounded-xl border border-sky-100/80 tracking-wider inline-flex items-center gap-1.5 shrink-0 select-none">
                                    🎫 {subTickets[0]?.invoice_type === 'other' ? 'Rescheduled' : 'First'} Attempt
                                  </span>

                                  {linkedInvoices.map((link, idx) => (
                                    <span 
                                      key={`link-badge-${idx}`}
                                      title={`Click to find Invoice: ${link.invoiceNumber}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const targetGroupKey = Object.keys(invoiceGroups).find(
                                          key => key.toLowerCase() === link.invoiceNumber.toLowerCase()
                                        ) || link.invoiceNumber;
                                        const targetId = `invoice-group-${String(targetGroupKey).toLowerCase().trim()}`;
                                        const targetElement = document.getElementById(targetId);
                                        if (targetElement) {
                                          targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                          setExpandedInvoices(prev => ({
                                            ...prev,
                                            [targetGroupKey]: true
                                          }));
                                          toast.success(`Jumping to Invoice: ${link.invoiceNumber}`);
                                        } else {
                                          toast.error(`Invoice ${link.invoiceNumber} not found in this view`);
                                        }
                                      }}
                                      className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] uppercase font-black px-3 py-1 rounded-xl border border-indigo-200/60 tracking-wider inline-flex items-center gap-1.5 shrink-0 select-none cursor-pointer transition-all duration-150"
                                    >
                                      🔗 Linked to {link.type === 'other' ? 'Rescheduled' : 'First'} Attempt: {link.invoiceNumber}
                                    </span>
                                  ))}

                                  {/* Tap for Passenger Details Animated Badge */}
                                  <span className={`text-[10px] uppercase font-black px-3 py-1 rounded-xl border tracking-wider inline-flex items-center gap-2 shrink-0 select-none transition-all duration-300 ${
                                    isExpanded 
                                      ? 'bg-slate-100 text-slate-500 border-slate-200' 
                                      : 'bg-indigo-50 text-indigo-700 border-indigo-200 shadow-3xs animate-pulse'
                                  }`}>
                                    <span className="relative flex h-2 w-2">
                                      {!isExpanded && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>}
                                      <span className={`relative inline-flex rounded-full h-2 w-2 ${isExpanded ? 'bg-slate-400' : 'bg-indigo-600'}`}></span>
                                    </span>
                                    {isExpanded ? 'Tap to hide' : 'Tap for details'}
                                  </span>

                                  {/* Project/Company Display Pill */}
                                  <div className="inline-flex items-center rounded-xl bg-sky-500/5 hover:bg-sky-500/10 border border-sky-500/20 px-3 py-1 bg-white text-xs select-none shadow-2xs font-sans transition-all duration-200 shrink-0">
                                    <span className="text-[10px] text-sky-600 font-black uppercase tracking-widest mr-1.5">Project/Re; company:</span>
                                    <span className="font-extrabold uppercase text-slate-800 tracking-tight">{projectNamesWithPOs}</span>
                                    {singleUnitTotalCost > 0 && (
                                      <span className={`text-[10px] font-black ml-1.5 shrink-0 px-1.5 py-0.5 rounded border leading-none ${
                                        activeAllocationUnits[0]?.type === 'company'
                                          ? 'text-emerald-700 bg-emerald-100/40 border-emerald-200/40'
                                          : 'text-sky-700 bg-sky-100/40 border-sky-200/40'
                                      }`}>
                                        {isLkrGroup ? 'LKR ' : '$'}{singleUnitTotalCost.toLocaleString()}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                              {/* PO Assignment Input Control */}
                              {activeAllocationUnits.length > 1 ? (
                                <div onClick={(e) => e.stopPropagation()} className="flex flex-col gap-2 bg-slate-100/90 p-3 rounded-2xl border border-slate-200/80 shadow-xs max-w-lg w-full">
                                  <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Project / Re; company PO Assignments:</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const projectPosMap = {
                                          ...groupExistingProjectPos,
                                          ...(bulkProjectPoNumbers[group.group_key] || {})
                                        };
                                        const poVal = Object.entries(projectPosMap)
                                          .filter(([id, val]) => activeAllocationUnits.some(unit => unit.id === id) && val)
                                          .map(([_, val]) => val)
                                          .join(', ');
                                        handleOpenErpPrepModal(group.invoice_number, poVal, projectPosMap, group.tickets, activeAllocationUnits);
                                      }}
                                      disabled={isSaving}
                                      className={`text-[10px] uppercase font-black tracking-wider px-3 py-1.5 rounded-lg cursor-pointer transition-all shrink-0 select-none ${
                                        isSaving 
                                          ? 'bg-slate-300 text-slate-500 cursor-not-allowed' 
                                          : 'bg-sky-500 text-black hover:bg-sky-500/95 shadow-sm active:scale-[0.98]'
                                      }`}
                                    >
                                      {isSaving ? 'Saving...' : 'Assign POs'}
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {activeAllocationUnits.map((unit, unitIdx) => {
                                      const currentVal = bulkProjectPoNumbers[group.group_key]?.[unit.id] !== undefined
                                        ? bulkProjectPoNumbers[group.group_key]?.[unit.id]
                                        : (groupExistingProjectPos[unit.id] || '');

                                      // Dynamically sum ticket costs for this specific project or company based on ticked status
                                      let unitCostTotal = 0;
                                      if (unit.type === 'project') {
                                        const matchedTickets = subTickets.filter((t: any) => {
                                          const isTickedProject = t.invoice_type === 'other'
                                            ? (!t.rescheduled_cost_allocation || t.rescheduled_cost_allocation === 'project')
                                            : (!t.cost_allocation || t.cost_allocation === 'project');
                                          if (!isTickedProject) return false;
                                          return Array.isArray(t.project_ids) 
                                            ? t.project_ids.includes(unit.id) 
                                            : t.project_id === unit.id;
                                        });
                                        unitCostTotal = matchedTickets.reduce((sum: number, t: any) => sum + getTicketCost(t), 0);
                                      } else if (unit.type === 'company') {
                                        const matchedTickets = subTickets.filter((t: any) => {
                                          const isTickedCompany = t.invoice_type === 'other'
                                            ? t.rescheduled_cost_allocation === 'company'
                                            : t.cost_allocation === 'company';
                                          if (!isTickedCompany) return false;
                                          return (t.company || 'Sanken Overseas') === unit.id;
                                        });
                                        unitCostTotal = matchedTickets.reduce((sum: number, t: any) => sum + getTicketCost(t), 0);
                                      }

                                      return (
                                        <div key={`${unit.id}-${unitIdx}`} className="flex flex-col gap-1 bg-white p-2 rounded-xl border border-slate-200 shadow-3xs">
                                          <div className="flex items-center justify-between gap-1">
                                            <div className="flex items-center min-w-0">
                                              <span className="text-[10px] font-extrabold text-slate-600 truncate" title={unit.name}>{unit.name}</span>
                                              <span className={`text-[10px] font-black ml-1.5 shrink-0 px-1.5 py-0.5 rounded ${
                                                unit.type === 'company' 
                                                  ? 'text-emerald-700 bg-emerald-100/40 border border-emerald-200/40' 
                                                  : 'text-sky-700 bg-sky-100/40 border border-sky-200/40'
                                              }`}>
                                                {isLkrGroup ? 'LKR ' : '$'}{unitCostTotal.toLocaleString()}
                                              </span>
                                            </div>
                                            <span className={`text-[8px] font-black uppercase px-1 py-0.5 rounded shrink-0 ${
                                              unit.type === 'company' 
                                                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200/50' 
                                                : 'bg-sky-50 text-sky-600 border border-sky-200/50'
                                            }`}>{unit.type === 'company' ? 'Re; company' : unit.type}</span>
                                          </div>
                                          <input 
                                            type="text"
                                            placeholder="Enter PO..."
                                            value={currentVal}
                                            onChange={(e) => {
                                              const val = e.target.value;
                                              setBulkProjectPoNumbers(prev => ({
                                                ...prev,
                                                [group.group_key]: {
                                                  ...(prev[group.group_key] || {}),
                                                  [unit.id]: val
                                                }
                                              }));
                                            }}
                                            className="text-xs p-1.5 border border-slate-200 rounded-lg focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none font-mono bg-slate-50 text-slate-900 transition-all font-bold"
                                          />
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : (
                                <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-2 bg-slate-100/80 p-1.5 rounded-xl border border-slate-200/80 shadow-xs max-w-sm w-full md:w-auto self-start lg:self-auto">
                                  <span className="text-xs font-bold text-slate-400 shrink-0 select-none uppercase tracking-wider pl-1.5">PO#:</span>
                                  {singleUnitTotalCost > 0 && (
                                    <span className={`text-[10px] font-black shrink-0 px-1.5 py-0.5 rounded border leading-none ${
                                      activeAllocationUnits[0]?.type === 'company'
                                        ? 'text-emerald-700 bg-emerald-100/40 border-emerald-200/40'
                                        : 'text-sky-700 bg-sky-100/40 border-sky-200/40'
                                    }`}>
                                      {isLkrGroup ? 'LKR ' : '$'}{singleUnitTotalCost.toLocaleString()}
                                    </span>
                                  )}
                                  <input 
                                    type="text"
                                    placeholder="Enter main PO reference..."
                                    value={currentPo}
                                    onChange={(e) => setBulkPoNumbers(prev => ({ ...prev, [group.group_key]: e.target.value }))}
                                    className="text-xs p-2 border border-slate-300 rounded-lg font-mono font-bold focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none w-full md:w-44 bg-slate-50 text-slate-950 leading-none transition-colors"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const singleUnit = activeAllocationUnits[0];
                                      const targetProjectPos = singleUnit ? { ...groupExistingProjectPos, [singleUnit.id]: currentPo } : groupExistingProjectPos;
                                      handleOpenErpPrepModal(group.invoice_number, currentPo, targetProjectPos, group.tickets, activeAllocationUnits);
                                    }}
                                    disabled={isSaving}
                                    className={`text-xs px-4 py-2 rounded-lg font-bold cursor-pointer transition-all shrink-0 select-none ${
                                      isSaving 
                                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed' 
                                        : 'bg-sky-500 text-black hover:bg-sky-500/90 hover:shadow active:scale-[0.98]'
                                    }`}
                                  >
                                    {isSaving ? 'Saving...' : 'Assign PO'}
                                  </button>
                                </div>
                              )}

                             {/* Individual Records Table */}
                             {isExpanded && (
                               <>
                                 {linkedInvoices.length > 0 && (
                                   <div className="p-4 bg-indigo-50/70 border-t border-b border-indigo-250/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-sans">
                                     <div className="flex items-start space-x-3 flex-1">
                                       <div className="p-2.5 bg-indigo-100 rounded-xl text-indigo-700 font-bold shrink-0">
                                         <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                         </svg>
                                       </div>
                                       <div>
                                         <h4 className="text-xs font-black text-indigo-950 uppercase tracking-widest">Linked Attempts Connection</h4>
                                         <p className="text-xs text-indigo-850 mt-1 leading-relaxed">
                                           This invoice connects to another attempt for passenger: <span className="font-extrabold text-indigo-900">{linkedInvoices.map(l => l.passengerName).join(', ')}</span>.
                                         </p>
                                         <div className="flex flex-wrap gap-2 mt-2">
                                           {linkedInvoices.map((link, idx) => (
                                             <button
                                               key={idx}
                                               type="button"
                                               onClick={() => {
                                                 const targetGroupKey = Object.keys(invoiceGroups).find(
                                                   key => key.toLowerCase() === link.invoiceNumber.toLowerCase()
                                                 ) || link.invoiceNumber;
                                                 const targetId = `invoice-group-${String(targetGroupKey).toLowerCase().trim()}`;
                                                 const targetElement = document.getElementById(targetId);
                                                 if (targetElement) {
                                                   targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                   setExpandedInvoices(prev => ({ ...prev, [targetGroupKey]: true }));
                                                   toast.success(`Jumping to Invoice: ${link.invoiceNumber}`);
                                                 } else {
                                                   toast.error(`Invoice ${link.invoiceNumber} not found in this view`);
                                                 }
                                               }}
                                               className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider bg-white hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-lg shadow-3xs transition-all flex items-center gap-1.5 cursor-pointer hover:shadow-xs active:scale-[0.98]"
                                             >
                                               Go to {link.type === 'other' ? 'Rescheduled' : 'First'} Attempt (Invoice: <span className="underline font-black">{link.invoiceNumber}</span>) &rarr;
                                             </button>
                                           ))}
                                         </div>
                                       </div>
                                     </div>
                                     <div className="text-right shrink-0 hidden md:block">
                                       <span className="text-[9px] bg-indigo-100 border border-indigo-250 text-indigo-850 font-black px-2.5 py-1 rounded-full uppercase tracking-wider select-none">
                                         Connected Invoice
                                       </span>
                                     </div>
                                   </div>
                                 )}
                                 <div className="overflow-x-auto border-t border-slate-200/60 bg-slate-50/10"><table className="min-w-full divide-y divide-slate-200/40 text-left">
                                   <thead className="bg-slate-100/40 border-b border-slate-200/40">
                                     <tr>
                                       <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider font-sans">Passenger Name</th>
                                       <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">Passport</th>
                                       <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider font-sans">Designation / Re; company</th>
                                       <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider font-sans">Cost Allocation</th>
                                       <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider font-sans">Cost</th>
                                       <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider font-sans">Status Details</th>
                                     </tr>
                                   </thead>
                                   <tbody className="divide-y divide-slate-200/30">
                                      {group.tickets.map((t, tIdx) => {
                                        const holdsMissed = t.invoice_type === 'other' ? t.rescheduled_flight_status === 'NO_SHOW' : t.flight_status === 'NO_SHOW';
                                        return (
                                          <tr 
                                            key={`${t.id}-${t.invoice_type}-${tIdx}`} 
                                            className={`transition-all duration-150 hover:shadow-[0_2px_8px_-1px_rgba(0,0,0,0.06)] hover:bg-slate-50 relative ${
                                              holdsMissed ? 'bg-rose-50/70 hover:bg-rose-100/60 border-l-4 border-l-red-500' : 'hover:bg-slate-50'
                                            }`}
                                          >
                                            <td className="px-3 py-2.5 max-w-[170px] whitespace-normal break-words">
                                              <div className="flex items-start space-x-2">
                                                {holdsMissed && (
                                                  <span className="text-red-650 font-extrabold text-[8px] bg-red-100 border border-red-200 px-1 py-0.5 rounded-sm animate-pulse shrink-0 mt-0.5">NO SHOW</span>
                                                )}
                                                <div className="min-w-0">
                                                  <span className={`block text-[10.5px] leading-tight font-bold break-words ${holdsMissed ? 'text-red-700 font-black' : 'text-slate-800'}`}>
                                                    {t.passenger_name}
                                                  </span>
                                                  <span className="text-[9px] text-slate-500 block font-mono mt-0.5">{t.route || 'No Route'}</span>
                                                </div>
                                              </div>
                                            </td>
                                            <td className="px-3 py-2.5 text-xs font-mono font-bold text-slate-500">
                                              {t.pp_number || '-'}
                                            </td>
                                            <td className="px-3 py-2.5 max-w-[140px] whitespace-normal break-words">
                                              <span className="block text-[10.5px] leading-tight text-slate-800 font-semibold">{t.job_category || '-'}</span>
                                              <span className="block text-[9px] text-slate-500 font-medium mt-0.5">{t.company || 'Sanken Overseas'}</span>
                                            </td>
                                            <td className="px-3 py-2.5">
                                              <div className="inline-flex items-center gap-1.5 bg-slate-50 px-1.5 py-1 rounded-lg border border-slate-200/50 shadow-3xs select-none">
                                                <label className="flex items-center gap-1 cursor-pointer text-[10.5px] font-semibold select-none group">
                                                  <input
                                                    type="checkbox"
                                                    checked={
                                                      t.invoice_type === 'other'
                                                        ? (!t.rescheduled_cost_allocation || t.rescheduled_cost_allocation === 'project')
                                                        : (!t.cost_allocation || t.cost_allocation === 'project')
                                                    }
                                                    onChange={() => handleSetCostAllocation(t.id, 'project', t.invoice_type)}
                                                    className="w-3.5 h-3.5 rounded text-sky-500 border-slate-350 focus:ring-sky-500 cursor-pointer"
                                                  />
                                                  <span className={`${
                                                    (t.invoice_type === 'other'
                                                      ? (!t.rescheduled_cost_allocation || t.rescheduled_cost_allocation === 'project')
                                                      : (!t.cost_allocation || t.cost_allocation === 'project'))
                                                      ? 'text-sky-600 font-extrabold'
                                                      : 'text-slate-400 group-hover:text-slate-600'
                                                  }`}>Project</span>
                                                </label>
                                                <div className="w-[1px] h-3 bg-slate-250" />
                                                <label className="flex items-center gap-1 cursor-pointer text-[10.5px] font-semibold select-none group">
                                                  <input
                                                    type="checkbox"
                                                    checked={
                                                      t.invoice_type === 'other'
                                                        ? t.rescheduled_cost_allocation === 'company'
                                                        : t.cost_allocation === 'company'
                                                    }
                                                    onChange={() => handleSetCostAllocation(t.id, 'company', t.invoice_type)}
                                                    className="w-3.5 h-3.5 rounded text-emerald-500 border-slate-350 focus:ring-emerald-500 cursor-pointer"
                                                  />
                                                  <span className={`${
                                                    (t.invoice_type === 'other'
                                                      ? t.rescheduled_cost_allocation === 'company'
                                                      : t.cost_allocation === 'company')
                                                      ? 'text-emerald-600 font-extrabold'
                                                      : 'text-slate-400 group-hover:text-slate-600'
                                                  }`}>Re; company</span>
                                                </label>
                                              </div>
                                            </td>
                                            <td className="px-3 py-2.5">
                                              <div className="flex flex-col items-start gap-0.5">
                                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-lg font-mono text-[11px] font-black select-none ${holdsMissed ? 'bg-rose-100 border border-rose-200 text-red-700 line-through decoration-red-500 decoration-2' : 'bg-slate-100 border border-slate-200 text-slate-700'}`}>
                                                  {t.currency === 'LKR' ? 'LKR ' : '$'}{getTicketCost(t).toLocaleString()}
                                                </span>
                                                {holdsMissed && (
                                                  <span className="text-[8px] font-black text-red-650 tracking-tight ml-1 animate-pulse">
                                                    ⚠️ Charge Forfeited
                                                  </span>
                                                )}
                                              </div>
                                            </td>
                                            <td className="px-3 py-2.5">
                                              <div className="flex flex-col gap-0.5">
                                                <span className={`text-[8.5px] font-extrabold uppercase tracking-wider ${
                                                  holdsMissed ? 'text-red-700 font-black' : 'text-slate-500'
                                                }`}>
                                                  {t.invoice_type === 'other' ? 'Rescheduled Attempt' : 'First Attempt'}
                                                </span>
                                                <span className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded border inline-block w-max uppercase tracking-wider ${
                                                  holdsMissed 
                                                    ? 'bg-red-600 text-white border-red-700 font-extrabold animate-pulse shadow-3xs px-1.5' 
                                                    : t.flight_status === 'DEPARTED' || t.rescheduled_flight_status === 'DEPARTED'
                                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                      : 'bg-slate-100 text-slate-400 border-slate-200/50'
                                                }`}>
                                                  {t.invoice_type === 'other' ? `Flight: ${t.rescheduled_flight_status || 'PENDING'}` : `Flight: ${t.flight_status || 'PENDING'}`}
                                                </span>
                                              </div>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                               </div>
                               </>
                             )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          );
        })()}

      </main>

      <UpdateFlightStatusModal
        isOpen={flightUpdateTicket !== null}
        ticket={flightUpdateTicket}
        onClose={() => setFlightUpdateTicket(null)}
        onSuccess={() => {
          setFlightUpdateTicket(null);
          setAllTicketsSubTab('DANGER_ZONE');
          fetchData();
        }}
      />

      {/* Upload/Attachment Modal */}
      {uploadTicketId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 p-6 max-w-lg w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center">
                <Upload className="w-5 h-5 mr-2 text-sky-500" />
                Attach Document / Image
              </h3>
              <button 
                type="button" 
                onClick={() => setUploadTicketId(null)} 
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 focus:outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-500 mb-4">
              Upload a ticket copy, baggage tag, passport scan, or receipt to attach it to this ticket for persistent tracking.
            </p>

            {/* Manual file uploader */}
            <div className="border-2 border-dashed border-slate-300 hover:border-sky-500 rounded-lg p-6 text-center cursor-pointer transition-all relative mb-6 group bg-slate-50 hover:bg-sky-50/20">
              <input 
                type="file" 
                accept="image/*,application/pdf" 
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const r = new FileReader();
                    r.onloadend = () => handleImageUpload(uploadTicketId, r.result as string);
                    r.readAsDataURL(file);
                  }
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
              />
              <Upload className="w-8 h-8 mx-auto text-slate-400 mb-2 group-hover:text-sky-500 transition-colors" />
              <p className="text-sm font-semibold text-slate-700">Click to upload or drag file</p>
              <p className="text-xs text-slate-400 mt-1">PDF, PNG, JPG or JPEG up to 5MB</p>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxImage && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in" onClick={() => setLightboxImage(null)}>
          <div className="relative max-w-4xl w-full flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
            <button 
              type="button" 
              onClick={() => setLightboxImage(null)} 
              className="absolute -top-12 right-0 p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-full transition-colors focus:outline-none"
              title="Close image viewer"
            >
              <X className="w-6 h-6" />
            </button>

            {/* Direct Link / Fallback Banner for pop-up or iframe blockers */}
            <div className="w-full bg-slate-850/95 border border-slate-700/80 text-slate-100 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4 text-xs shadow-lg font-sans">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-5 h-5 text-sky-400 shrink-0 animate-pulse" />
                <div>
                  <span className="font-bold text-sky-400 block sm:inline">Viewing Block Alert?</span>
                  <span className="text-slate-300 block sm:inline sm:ml-1">
                    If this scan does not render or is blank due to your browser security, use these safe links:
                  </span>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <a
                  href={lightboxImage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-1.5 bg-sky-500 hover:bg-sky-400 text-black font-extrabold rounded-lg transition-all flex items-center gap-1.5 shadow"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open in New Tab
                </a>
                <button
                  type="button"
                  onClick={() => handleDownloadFile(lightboxImage, 'download_scan_document.pdf')}
                  className="px-3.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg transition-all flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Directly
                </button>
              </div>
            </div>

            <div className="bg-white p-2 rounded-xl shadow-2xl border border-slate-200 max-h-[70vh] w-full overflow-hidden flex items-center justify-center">
              {isWebUrl(lightboxImage) ? (
                <div className="text-center p-8 bg-slate-50 rounded-lg border border-slate-200 max-w-md my-8 flex flex-col items-center justify-center">
                  <FileText className="w-12 h-12 text-sky-500 mx-auto mb-4 animate-bounce shrink-0" />
                  <h3 className="text-base font-bold text-slate-800 mb-1 font-sans">SharePoint / External Document</h3>
                  <p className="text-xs text-slate-500 mb-4 font-sans">This document is hosted on an external SharePoint or web server and cannot be directly previewed inside an iframe.</p>
                  <a
                    href={lightboxImage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-lg shadow transition-colors font-sans"
                  >
                    Open Link in New Tab
                  </a>
                </div>
              ) : isPdfUrl(lightboxImage) ? (
                <iframe 
                  src={lightboxImage} 
                  title="PDF Attachment Viewer" 
                  className="w-full h-[55vh] border border-slate-300 rounded-lg bg-slate-100" 
                />
              ) : (
                <img 
                  src={lightboxImage} 
                  alt="Fullscreen Attachment" 
                  referrerPolicy="no-referrer"
                  className="max-w-full max-h-[60vh] object-contain rounded-lg" 
                />
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleDownloadFile(lightboxImage, 'document_file.pdf')}
                className="px-5 py-2.5 bg-sky-500 hover:bg-sky-600 text-black font-bold text-sm rounded-xl shadow-md transition-all flex items-center cursor-pointer"
              >
                <Download className="w-4 h-4 mr-1.5" />
                Download Scan
              </button>
              <a 
                href={lightboxImage}
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-medium text-sm rounded-xl transition-colors flex items-center"
              >
                <ExternalLink className="w-4 h-4 mr-1.5" />
                Raw Link
              </a>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white font-medium text-sm rounded-xl transition-all cursor-pointer"
              >
                Close Viewer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Finance ERP Entry Completion Modal */}
      {erpBulkModalData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" onClick={() => setErpBulkModalData(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] overflow-y-auto flex flex-col font-sans" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
              <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50/50">
                <div>
                  <h3 className="text-lg font-black text-slate-950 uppercase tracking-tight flex items-center gap-2">
                    <FileText className="w-5 h-5 text-sky-500" />
                    Finance ERP Entry
                  </h3>
                  <p className="text-xs font-semibold text-slate-500 mt-0.5">
                    Complete stage 3 details for Invoice: <span className="font-mono text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded text-[11px] font-bold">{erpBulkModalData.invoice_number}</span>
                  </p>
                </div>
                <button 
                  type="button" 
                  onClick={() => setErpBulkModalData(null)} 
                  className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors focus:outline-none"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-5 overflow-y-auto">
                
                {/* PO Date & Invoice Date Fields Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black uppercase text-slate-500 tracking-wider mb-1.5">PO Date</label>
                    <input 
                      type="date"
                      value={erpPoDate}
                      onChange={(e) => setErpPoDate(e.target.value)}
                      className="w-full text-sm p-2.5 border border-slate-300 rounded-xl focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none hover:border-slate-400 transition-colors font-medium text-slate-900 bg-white"
                    />
                    <p className="text-[10px] text-slate-400 mt-1 font-medium">Auto-populated with today's date upon assignment.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-black uppercase text-slate-500 tracking-wider mb-1.5">Invoice Date</label>
                    <input 
                      type="date"
                      value={erpInvoiceDate}
                      onChange={(e) => setErpInvoiceDate(e.target.value)}
                      className="w-full text-sm p-2.5 border border-slate-300 rounded-xl focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none hover:border-slate-400 transition-colors font-medium text-slate-900 bg-white"
                    />
                  </div>
                </div>

                {/* PO Numbers (Editable per allocation unit) */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                  <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider block">Project / Re; company PO References:</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {erpBulkModalData.activeAllocationUnits.map((unit) => {
                      const currentVal = erpProjectPos[unit.id] || '';
                      return (
                        <div key={unit.id} className="flex flex-col gap-1 bg-white p-3 rounded-xl border border-slate-200/60 shadow-xs">
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-[11px] font-black text-slate-700 truncate" title={unit.name}>{unit.name}</span>
                            <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded shrink-0 ${
                              unit.type === 'company' 
                                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200/50' 
                                : 'bg-sky-50 text-sky-600 border border-sky-200/50'
                            }`}>{unit.type === 'company' ? 'Re; company' : unit.type}</span>
                          </div>
                          <input 
                            type="text"
                            placeholder="Enter PO..."
                            value={currentVal}
                            onChange={(e) => {
                              const val = e.target.value;
                              setErpProjectPos(prev => ({
                                ...prev,
                                [unit.id]: val
                              }));
                            }}
                            className="text-xs p-2 border border-slate-200 rounded-lg focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none font-mono bg-slate-50 text-slate-900 transition-all font-bold"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Passenger Invoice Amount Controls */}
                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-black text-slate-500 uppercase tracking-wider block">Passenger & Invoice Ticket Amounts:</span>
                      <p className="text-[10px] text-slate-400 font-medium font-sans">Enter the distinct amount for each passenger record.</p>
                    </div>
                    
                    {/* Quick autofiller tools */}
                    <div className="flex items-center gap-1.5 self-start sm:self-auto bg-slate-100 p-1 rounded-xl">
                      <input 
                        type="number"
                        step="0.01"
                        placeholder="Total or single val..."
                        id="bulk_modal_quick_amount"
                        className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg focus:outline-none w-28 bg-white font-bold text-slate-900"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const val = (document.getElementById('bulk_modal_quick_amount') as HTMLInputElement)?.value;
                          if (!val) return;
                          const numeric = parseFloat(val);
                          if (isNaN(numeric)) return;
                          
                          const newAmounts: Record<string, string> = {};
                          erpBulkModalData.tickets.forEach((t: any) => {
                            newAmounts[t.id] = String((numeric / erpBulkModalData.tickets.length).toFixed(2));
                          });
                          setErpInvoiceAmounts(newAmounts);
                          toast.success(`Split total of $${numeric} equally across ${erpBulkModalData.tickets.length} tickets!`);
                        }}
                        className="text-[9px] font-black uppercase tracking-wider bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 px-2 py-1.5 rounded-lg transition-colors cursor-pointer"
                      >
                        Split Equally
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const val = (document.getElementById('bulk_modal_quick_amount') as HTMLInputElement)?.value;
                          if (!val) return;
                          const newAmounts: Record<string, string> = {};
                          erpBulkModalData.tickets.forEach((t: any) => {
                            newAmounts[t.id] = val;
                          });
                          setErpInvoiceAmounts(newAmounts);
                          toast.success(`Applied $${val} to all tickets!`);
                        }}
                        className="text-[9px] font-black uppercase tracking-wider bg-sky-500 text-black hover:bg-sky-600 px-2 py-1.5 rounded-lg transition-colors cursor-pointer font-bold"
                      >
                        Copy to All
                      </button>
                    </div>
                  </div>

                  {/* Tickets grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-48 overflow-y-auto pr-1">
                    {erpBulkModalData.tickets.map((t: any) => {
                      const ticketAmount = erpInvoiceAmounts[t.id] || '';
                      return (
                        <div key={t.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between gap-2.5">
                          <div className="truncate flex-1">
                            <span className="block text-xs font-extrabold text-slate-800 truncate" title={t.passenger_name}>
                              {t.passenger_name || 'Generic Passenger'}
                            </span>
                            <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                              {t.travel_agent || 'Direct'} • {t.flight_status || 'OK'}
                            </span>
                          </div>
                          <div className="w-1/3 min-w-[100px] shrink-0">
                            <input 
                              type="number"
                              step="0.01"
                              placeholder="Amount ($)..."
                              value={ticketAmount}
                              onChange={(e) => {
                                const v = e.target.value;
                                setErpInvoiceAmounts(prev => ({
                                  ...prev,
                                  [t.id]: v
                                }));
                              }}
                              className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:border-sky-500 focus:ring-1 focus:ring-sky-500 bg-white text-slate-900 font-mono font-bold text-right"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Status and Remarks */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                  <div>
                    <label className="block text-xs font-black uppercase text-slate-500 tracking-wider mb-1.5">PO Status</label>
                    <select 
                      value={erpPoStatus}
                      onChange={(e) => setErpPoStatus(e.target.value)}
                      className="w-full text-sm p-2.5 border border-slate-300 rounded-xl focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none hover:border-slate-400 transition-colors font-semibold text-slate-800 bg-white"
                    >
                      <option value="pending po approval">Pending PO Approval</option>
                      <option value="check cannot proceed">Check Cannot Proceed</option>
                      <option value="payment done">Payment Done</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-black uppercase text-slate-500 tracking-wider mb-1.5">PO Remarks / Notes (Optional)</label>
                    <textarea 
                      placeholder="Enter process remarks..."
                      value={erpPoRemarks}
                      onChange={(e) => setErpPoRemarks(e.target.value)}
                      className="w-full text-xs p-2.5 border border-slate-300 rounded-xl focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none hover:border-slate-400 transition-colors font-medium text-slate-800 bg-white h-11 resize-none"
                      rows={1}
                    />
                  </div>
                </div>

                {erpPoStatus === 'payment done' && (
                  <div className="border-t border-slate-100 pt-4 mt-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-black uppercase text-slate-500 tracking-wider mb-1.5">Payment Date</label>
                        <input
                          type="date"
                          value={erpPaymentDate}
                          onChange={(e) => setErpPaymentDate(e.target.value)}
                          className="w-full text-sm p-2.5 border border-slate-300 rounded-xl focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none hover:border-slate-400 transition-colors font-semibold text-slate-800 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-black uppercase text-slate-500 tracking-wider mb-1.5">Payment Invoice / Receipt Numbers</label>
                        <input
                          type="text"
                          value={erpPaymentInvoiceNumbers}
                          onChange={(e) => setErpPaymentInvoiceNumbers(e.target.value)}
                          placeholder="Receipt or Ref numbers"
                          className="w-full text-sm p-2.5 border border-slate-300 rounded-xl focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none hover:border-slate-400 transition-colors font-semibold text-slate-800 bg-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-black uppercase text-slate-500 tracking-wider mb-1.5">Paid To (Travel Agent)</label>
                      {!erpIsAddingNewAgent ? (
                        <div className="flex gap-2">
                          <select
                            value={erpTravelAgent}
                            onChange={(e) => {
                              if (e.target.value === '__NEW__') {
                                setErpIsAddingNewAgent(true);
                              } else {
                                setErpTravelAgent(e.target.value);
                              }
                            }}
                            className="flex-1 text-sm p-2.5 border border-slate-300 rounded-xl focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none hover:border-slate-400 transition-colors font-semibold text-slate-800 bg-white"
                          >
                            <option value="">Select Travel Agent</option>
                            {getFilteredOptions('TRAVEL_AGENT').map((opt: any) => (
                              <option key={opt.id} value={opt.value}>
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
                            value={erpNewAgentName}
                            onChange={(e) => setErpNewAgentName(e.target.value)}
                            placeholder="Enter agent name"
                            className="flex-1 text-sm p-2.5 border border-slate-300 rounded-xl focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none hover:border-slate-400 transition-colors font-semibold text-slate-800 bg-white"
                          />
                          <button
                            type="button"
                            onClick={handleAddNewPaymentAgent}
                            className="px-4 py-2.5 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-slate-800 cursor-pointer"
                          >
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={() => setErpIsAddingNewAgent(false)}
                            className="px-4 py-2.5 bg-slate-200 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-300 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">
                  Assigning {erpBulkModalData.tickets.length} {erpBulkModalData.tickets.length === 1 ? 'record' : 'records'}
                </span>

                <div className="flex gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setErpBulkModalData(null)}
                    className="flex-1 sm:flex-initial px-4 py-2.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl transition-all shadow-3xs cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const combinedPo = Object.values(erpProjectPos)
                        .filter(Boolean)
                        .join(', ');

                      handleAssignBulkPO(
                        erpBulkModalData.invoice_number,
                        combinedPo || erpBulkModalData.po_number,
                        erpProjectPos,
                        erpPoDate,
                        erpInvoiceDate,
                        erpInvoiceAmounts,
                        erpPoStatus,
                        erpPoRemarks
                      );
                    }}
                    disabled={isSaving}
                    className="flex-1 sm:flex-initial px-5 py-2.5 bg-sky-500 hover:bg-sky-600 text-black font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {isSaving ? 'Processing...' : 'Complete ERP Entry'}
                  </button>
                </div>
              </div>

            </div>
          </div>
      )}
      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={confirmDelete}
        title="Delete Tickets"
        message={`Are you sure you want to permanently delete ${ticketToDelete?.size || 0} selected ticket(s)? This action cannot be undone.`}
      />
    </div>
  );
}
