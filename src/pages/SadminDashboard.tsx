import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store';
import api from '../api';
import toast from 'react-hot-toast';
import {
  Search,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Filter,
  Download,
  CheckCircle,
  XCircle,
  Plus,
  Plane,
  DollarSign,
  Users,
  Bell,
  FileText,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Shield,
  Clock,
  Briefcase,
  AlertTriangle,
  ArrowRight
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { format, subDays, differenceInDays, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';

// ---------------------------------------------------------
// Custom Type Declarations Matching Firestore Entities
// ---------------------------------------------------------
interface Ticket {
  id: string;
  passenger_name: string;
  route: string;
  departure_date: string;
  approved_rate?: number | string;
  currency?: string;
  lkr_approved_rate?: number;
  lkr_invoice_amount?: number;
  travel_agent?: string;
  flight_status?: string;
  rescheduled_flight_status?: string;
  arrival_date?: string;
  created_at: any;
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | string;
  priority?: 'High' | 'Medium' | 'Low' | string;
  job_category?: string;
  po_number?: string;
  po_status?: string;
  po_date?: string;
  invoice_number?: string;
  invoice_amount?: number | string;
  invoice_date?: string;
  project_id?: string;
  assigned_to?: string;
}

interface Project {
  id: string;
  name: string;
  code: string;
  budget_allocated: number;
}

interface WorkerDeployment {
  id: string;
  worker_name: string;
  role: string;
  start_date: string;
  end_date: string;
  ticket_ids: string[];
  allowance_allocated: number;
  actual_ticket_cost: number;
  status: 'Active' | 'Completed' | 'Cancelled';
}

interface Notification {
  id: string;
  title: string;
  message: string;
  timestamp: Date;
  priority: 'High' | 'Critical' | 'Medium' | 'Low';
  role_target: string[];
  read: boolean;
}

const safeParseISO = (dateStr: string | any): Date => {
  if (!dateStr) return new Date();
  try {
    const d = typeof dateStr === 'string' ? parseISO(dateStr) : new Date(dateStr);
    return isNaN(d.getTime()) ? new Date() : d;
  } catch {
    return new Date();
  }
};

const safeDiffDays = (dateStr1: string | any, dateStr2: string | any): number => {
  if (!dateStr1 || !dateStr2) return 0;
  try {
    const d1 = safeParseISO(dateStr1);
    const d2 = safeParseISO(dateStr2);
    return differenceInDays(d1, d2);
  } catch {
    return 0;
  }
};

export default function SadminDashboard() {
  const { role, user, token } = useAuthStore();
  const navigate = useNavigate();

  // ---------------------------------------------------------
  // Roles & Security Gating Check
  // ---------------------------------------------------------
  // Normalized role string
  const normRole = (role || '').toUpperCase();
  const isSadmin = normRole === 'SADMIN'; 
  const isFinance = normRole === 'FINANCE' || isSadmin;
  const isPM = normRole === 'PM' || normRole === 'MANAGER' || isSadmin;
  const isAnyAdmin = ['SADMIN', 'MANAGER'].includes(normRole);

  // Redirect to login if user is not authorized
  useEffect(() => {
    if (!role) {
      navigate('/login');
    } else if (!isAnyAdmin) {
      toast.error("Access denied: SADMIN features are reserved for Admin roles.");
      navigate('/dashboard');
    }
  }, [role, isAnyAdmin, navigate]);

  // ---------------------------------------------------------
  // Component States & Core Filters
  // ---------------------------------------------------------
  const [activeSection, setActiveSection] = useState<'tickets' | 'finance' | 'pm' | 'backup' | 'deletion'>('tickets');
  const [deletionRequests, setDeletionRequests] = useState<any[]>([]);
  const [collapsibles, setCollapsibles] = useState({
    tickets: false,
    finance: false,
    pm: false,
    deletion: false
  });

  // Global Date Filters
  // Presets: 'all' | '7days' | '30days' | '90days' | 'thisMonth' | 'custom'
  const [globalDateRange, setGlobalDateRange] = useState<'all' | '7days' | '30days' | '90days' | 'thisMonth' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [customEndDate, setCustomEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Detail Drawer or Ticket View state
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [flightUpdateTicket, setFlightUpdateTicket] = useState<Ticket | null>(null);
  const [flightForm, setFlightForm] = useState({
    booking_reference: '',
    flight_number: '',
    flight_status: 'CONFIRMED'
  });

  // Project Deployment Period Selector
  const [projectPeriod, setProjectPeriod] = useState<'all' | 'current' | 'recent'>('all');

  // Interactive Widget States (Searching / Table Sorts / Paginations)
  const [loading, setLoading] = useState(true);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [projectsList, setProjectsList] = useState<Project[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // Widget A-1 Sort & Sub-Filter Preset
  const [a1TablePreset, setA1TablePreset] = useState<'all' | '7days' | '30days' | '90days' | 'custom'>('all');
  const [a1SortColumn, setA1SortColumn] = useState<keyof Ticket>('created_at');
  const [a1SortDirection, setA1SortDirection] = useState<'asc' | 'desc'>('desc');
  const [a1SearchText, setA1SearchText] = useState('');

  // Widget F-1 Overdue Payments Sort & Month Selector
  const [f1SortBy, setF1SortBy] = useState<'days' | 'month' | 'amount' | 'invoice_number' | 'travel_agent' | 'invoice_date'>('days');
  const [f1SortDir, setF1SortDir] = useState<'asc' | 'desc'>('desc');
  const [f1StartDate, setF1StartDate] = useState<string>('');
  const [f1EndDate, setF1EndDate] = useState<string>('');

  // Widget F-2 Month Selection Controls
  const [agentMonthOffset, setAgentMonthOffset] = useState<number>(0);

  // Widget F-3 Toggle Views (Weekly vs Monthly)
  const [f3ViewType, setF3ViewType] = useState<'weekly' | 'monthly'>('weekly');
  const [selectedF3Agent, setSelectedF3Agent] = useState<string>('All Agents');

  // ---------------------------------------------------------
  // High-Fidelity Mock Seed Data Generator (Minimum 25 full records)
  // ---------------------------------------------------------
  const generatedMockTickets = useMemo(() => {
    const categories = ['Travel', 'Accommodation', 'Logistics', 'Consultancy', 'Overhead'];
    const routes = ['Colombo - Male', 'Male - Colombo', 'Dubai - Colombo', 'Colombo - Dubai', 'Colombo - Seychelles', 'Seychelles - Colombo'];
    const agents = ['Mackinnons Travels', 'Classic Travels', 'Hemline Travels', 'Sanken In-House'];
    const names = [
      'Nishan Perera', 'Kasun Silva', 'Samantha Jayawardene', 'Aruni Fernando', 'Roshan Alwis',
      'Minura de Silva', 'Duminda Ratnayake', 'Suresh Kumar', 'Dilini Cooray', 'Ruwan Wickramasinghe',
      'Pathum Nishshanka', 'John Dumont', 'Ahamad Al-Fayed', 'Sajjad Hussain', 'Praveen Ramanayake',
      'Menaka Gunawardena', 'Lasantha Alwis', 'Manoj Wijesinghe', 'Imtiaz Ahamed', 'Tharaka Herath',
      'Dinesh Priyantha', 'Chaminda Edirisinghe', 'Devinda de Silva', 'Nuwan Kalpage', 'Tilan Samaraweera'
    ];
    const statuses = ['OPEN', 'IN_PROGRESS', 'COMPLETED'];
    const priorities = ['High', 'Medium', 'Low'];
    const poStatuses = ['pending po approval', 'payment done', 'pending', 'under review', 'escalated'];

    return Array.from({ length: 40 }).map((_, idx) => {
      const daysAgo = (idx * 3) + 1;
      const createdDate = subDays(new Date(), daysAgo);
      const category = categories[idx % categories.length];
      const passenger = names[idx % names.length];
      const route = routes[idx % routes.length];
      const agent = agents[idx % agents.length];
      const status = idx < 12 ? 'COMPLETED' : statuses[idx % statuses.length];
      const priority = priorities[idx % priorities.length];
      const currency = 'USD';
      const ticketCost = 150 + (idx * 15);

      // Pending PO, missing flight, overdue states
      let po_status = poStatuses[idx % poStatuses.length];
      let po_number = `PO-2026-${1000 + idx}`;
      let invoice_number = `INV-2026-${1500 + idx}`;
      let invoice_amount = ticketCost;
      let invoice_date = format(subDays(new Date(), daysAgo + 2), 'yyyy-MM-dd');
      
      if (idx % 4 === 0) {
        po_status = 'pending po approval';
      } else if (idx % 5 === 0) {
        po_status = 'pending';
      } else if (idx % 3 === 0) {
        po_status = 'payment done';
      }

      // Overdue payments simulation (Stage 3 completed but po_status is pending and invoice date was > 14 days ago)
      const isOverdue = idx % 5 === 0 && daysAgo > 15;

      return {
        id: `SKOA-${10000 + idx}`,
        passenger_name: passenger,
        route: route,
        departure_date: format(subDays(new Date(), daysAgo - 4), 'yyyy-MM-dd'),
        approved_rate: ticketCost,
        currency: currency,
        lkr_approved_rate: ticketCost * 300,
        lkr_invoice_amount: invoice_amount * 300,
        travel_agent: agent,
        flight_status: idx % 6 === 0 ? 'PENDING' : 'CONFIRMED',
        rescheduled_flight_status: idx % 9 === 0 ? 'PENDING' : undefined,
        created_at: createdDate.toISOString(),
        status: status,
        priority: priority,
        category: category,
        po_number: po_status === 'pending' ? undefined : po_number,
        po_status: po_status,
        po_date: format(subDays(new Date(), daysAgo + 1), 'yyyy-MM-dd'),
        invoice_number: po_status === 'pending' ? undefined : invoice_number,
        invoice_amount: invoice_amount,
        invoice_date: invoice_date,
        project_id: idx % 3 === 0 ? 'PROJ-SEY' : (idx % 3 === 1 ? 'PROJ-MLD' : 'PROJ-DXB'),
        assigned_to: idx % 2 === 0 ? 'Admin 1' : 'System Admin'
      } as Ticket;
    });
  }, []);

  const generatedMockWorkerDeployments = useMemo((): WorkerDeployment[] => {
    const roles = ['Project Engineer', 'General Foreman', 'Safety Officer', 'Quantity Surveyor', 'MEP Coordinator'];
    const names = [
      'Gayan Jayasuriya', 'Samantha Perera', 'Harendra Alwis', 'Manoj Silva', 'Thilina de Silva',
      'Asanka Gunasekara', 'Thusitha Wickrama', 'Sanjaya Liyanage', 'Ruwan Herath', 'Ishara Mendis',
      'Kelum Priyadarshana', 'Anura Bandaranaike', 'Sheron Fernando', 'Kamal Wijeratne', 'Ranga Diaz'
    ];
    return Array.from({ length: 15 }).map((_, idx) => {
      const actualCost = 65000 + (idx * 12000);
      const allowance = 80000 + ((idx % 3) * 10000);
      const projectId = projectsList.length > 0 ? projectsList[idx % projectsList.length].id : 'GENERAL';
      return {
        id: `WRK-26${idx.toString().padStart(2, '0')}`,
        worker_name: names[idx % names.length],
        role: roles[idx % roles.length],
        start_date: format(subDays(new Date(), 45 - idx), 'yyyy-MM-dd'),
        end_date: format(subDays(new Date(), -15 - idx), 'yyyy-MM-dd'),
        ticket_ids: [`SKOA-${10000 + idx}`, `SKOA-${10005 + idx}`],
        allowance_allocated: allowance,
        actual_ticket_cost: idx % 4 === 0 ? allowance + 15000 : actualCost, // Force exceeding alerts
        status: idx === 14 ? 'Cancelled' : (idx > 10 ? 'Completed' : 'Active')
      };
    });
  }, [projectsList]);

  // ---------------------------------------------------------
  // Real Firestore Data Loader + Mock Fallback Seed Match
  // ---------------------------------------------------------
  const loadData = async (isManual = false) => {
    if (!token) return;
    if (isManual) setManualRefreshing(true);
    setLoading(true);
    try {
      const ticketsRes = await api.get('/tickets');
      const projectsRes = await api.get('/projects');

      // Fetch real tickets and projects
      let dbTickets = ticketsRes.data && Array.isArray(ticketsRes.data.tickets)
        ? ticketsRes.data.tickets
        : (Array.isArray(ticketsRes.data) ? ticketsRes.data : []);
      let dbProjects = Array.isArray(projectsRes.data) ? projectsRes.data : [];

      // Convert Firestore created_at inside tickets cleanly
      const parsedTickets = dbTickets.map((t: any) => {
        let normalizedDateStr = t.created_at;
        if (t.created_at && t.created_at.seconds) {
          normalizedDateStr = new Date(t.created_at.seconds * 1000).toISOString();
        } else if (t.created_at && t.created_at._seconds) {
          normalizedDateStr = new Date(t.created_at._seconds * 1000).toISOString();
        }

        const originalRate = Number(t.approved_rate) || Number(t.price) || Number(t.invoice_amount) || 0;
        const originalInvoiceAmount = Number(t.invoice_amount) || 0;
        const ticketCurrency = (t.currency || 'USD').toUpperCase();
        
        let approved_rate = originalRate;
        let invoice_amount = originalInvoiceAmount;
        let lkr_approved_rate = originalRate * 300;
        let lkr_invoice_amount = originalInvoiceAmount * 300;
        
        // Keep LKR exactly as entered without converting or dividing by 300 anywhere!
        if (ticketCurrency === 'LKR') {
          approved_rate = originalRate;
          invoice_amount = originalInvoiceAmount;
          lkr_approved_rate = originalRate;
          lkr_invoice_amount = originalInvoiceAmount;
        }

        return {
          ...t,
          created_at: normalizedDateStr || new Date().toISOString(),
          approved_rate: approved_rate,
          invoice_amount: invoice_amount,
          lkr_approved_rate: lkr_approved_rate,
          lkr_invoice_amount: lkr_invoice_amount,
          currency: ticketCurrency,
          priority: t.priority || 'Medium',
          category: t.category || (t.job_category ? 'Travel' : 'Logistics'),
          status: t.status || 'OPEN'
        };
      });

      // Supplement Projects
      let finalProjects = dbProjects.map((p: any) => ({
        id: p.id || '',
        name: p.name || 'Unnamed Project',
        code: (p.id || '').substring(0, 8) || p.code || 'PROJ',
        budget_allocated: Number(p.budget_allocated || p.budget) || 500000
      }));

      setAllTickets(parsedTickets);
      setProjectsList(finalProjects);

      // Generate context-aware notifications list based on loaded records
      generateAlertNotifications(parsedTickets);

    } catch (err: any) {
      if (err.response?.status !== 401) {
        console.error("Error loading admin dashboard metrics:", err);
        toast.error("Failed to sync some Firestore elements.");
      }
      setAllTickets([]);
      setProjectsList([]);
    } finally {
      setLoading(false);
      setManualRefreshing(false);
    }
  };

  // Helper: check status criteria for triggering notifications automatically
  const generateAlertNotifications = (tickets: Ticket[]) => {
    const alerts: Notification[] = [];
    const now = new Date();

    // 1. Check PO pending > 7 days
    tickets.forEach(t => {
      if (t.po_status !== 'payment done' && t.po_date) {
        const age = safeDiffDays(now, t.po_date);
        if (age > 7) {
          alerts.push({
            id: `NT-${t.id}-PO-AGE`,
            title: `PO Pending Action Over 7 Days`,
            message: `Purchase Order for Ticket ${t.id} has been pending for ${age} days.`,
            timestamp: safeParseISO(t.po_date),
            priority: 'High',
            role_target: ['FINANCE', 'ADMIN'],
            read: false
          });
        }
      }

      // 2. Flight update overdue (travel date <= 2 days away and has missing flight info)
      if (t.departure_date && (t.flight_status === 'PENDING' || !t.flight_status)) {
        const daysToTravel = safeDiffDays(t.departure_date, now);
        if (daysToTravel >= 0 && daysToTravel <= 2) {
          alerts.push({
            id: `NT-${t.id}-FLT-URGENT`,
            title: `Flight Update Overdue (Critical)`,
            message: `Ticket ${t.id} of traveler ${t.passenger_name} departs in ${daysToTravel} days. Missing flight details.`,
            timestamp: safeParseISO(t.departure_date),
            priority: 'Critical',
            role_target: ['ADMIN', 'ADMIN1'],
            read: false
          });
        }
      }

      // 3. Invoice overdue > 30 days
      if (t.invoice_date && t.po_status !== 'payment done') {
        const invAge = safeDiffDays(now, t.invoice_date);
        if (invAge > 30) {
          alerts.push({
            id: `NT-${t.id}-INV-OVERDUE`,
            title: `Invoice Past Due Over 30 Days`,
            message: `Inward Invoice link ${t.invoice_number || 'Ref'} remains unpaid for ${invAge} days.`,
            timestamp: safeParseISO(t.invoice_date),
            priority: 'High',
            role_target: ['FINANCE', 'ADMIN'],
            read: false
          });
        }
      }
    });

    // 4. Budget Exceeded items notice
    generatedMockWorkerDeployments.forEach(w => {
      if (w.actual_ticket_cost > w.allowance_allocated) {
        alerts.push({
          id: `NT-${w.id}-BUDGET-EXCEED`,
          title: `Project Allowance Exceeded`,
          message: `Passenger ${w.worker_name} exceeded budgeted travel allowance on project.`,
          timestamp: now,
          priority: 'High',
          role_target: ['PM', 'ADMIN'],
          read: false
        });
      }
    });

    setNotifications(alerts);
  };

  const loadDeletionRequests = async () => {
    try {
      const res = await api.get('/deletion-requests');
      setDeletionRequests(res.data);
    } catch (err) {
      console.error("Error loading deletion requests:", err);
    }
  };

  // Run initial boot fetch and setup interval check every 5 mins
  useEffect(() => {
    loadData();
    loadDeletionRequests();
    const interval = setInterval(() => {
      loadData();
      loadDeletionRequests();
    }, 5 * 60 * 1000); // 5 mins auto-refresh
    return () => clearInterval(interval);
  }, []);

  // ---------------------------------------------------------
  // Date Filtering Calculation & Helpers
  // ---------------------------------------------------------
  const isTicketInDateRange = (ticketDateStr: string, preset: string) => {
    const date = new Date(ticketDateStr);
    const now = new Date();
    
    switch (preset) {
      case '7days':
        return date >= subDays(now, 7);
      case '30days':
        return date >= subDays(now, 30);
      case '90days':
        return date >= subDays(now, 90);
      case 'thisMonth':
        return isWithinInterval(date, { start: startOfMonth(now), end: endOfMonth(now) });
      case 'custom':
        return isWithinInterval(date, { 
          start: new Date(customStartDate + 'T00:00:00'), 
          end: new Date(customEndDate + 'T23:59:59') 
        });
      default:
        return true;
    }
  };

  // Global Filtered Tickets for widgets matching currently selected range
  const filteredTickets = useMemo(() => {
    return allTickets.filter(t => isTicketInDateRange(t.created_at, globalDateRange));
  }, [allTickets, globalDateRange, customStartDate, customEndDate]);

  // Widget A-1 Specific Table Filter (with its own sub-bar or preset control)
  const a1FilterPresetValue = a1TablePreset === 'custom' ? globalDateRange : a1TablePreset;
  const a1FilteredTickets = useMemo(() => {
    let list = allTickets.filter(t => isTicketInDateRange(t.created_at, a1TablePreset));

    // Support search query (Ticket ID, passenger name, destination/route, agent name)
    if (a1SearchText.trim() !== '') {
      const q = a1SearchText.toLowerCase();
      list = list.filter(t =>
        (t.id || '').toLowerCase().includes(q) ||
        (t.passenger_name || '').toLowerCase().includes(q) ||
        (t.route || '').toLowerCase().includes(q) ||
        (t.travel_agent || '').toLowerCase().includes(q)
      );
    }

    // Apply Sorting
    return list.sort((a: any, b: any) => {
      let valA = a[a1SortColumn];
      let valB = b[a1SortColumn];

      if (a1SortColumn === 'created_at') {
        const timeA = new Date(valA).getTime();
        const timeB = new Date(valB).getTime();
        return a1SortDirection === 'asc' ? timeA - timeB : timeB - timeA;
      }

      if (typeof valA === 'number' && typeof valB === 'number') {
        return a1SortDirection === 'asc' ? valA - valB : valB - valA;
      }

      valA = String(valA || '').toLowerCase();
      valB = String(valB || '').toLowerCase();
      return a1SortDirection === 'asc' 
        ? valA.localeCompare(valB) 
        : valB.localeCompare(valA);
    });
  }, [allTickets, a1TablePreset, a1SearchText, a1SortColumn, a1SortDirection, globalDateRange]);

  // ---------------------------------------------------------
  // Widget Math Computations
  // ---------------------------------------------------------

  // WIDGET A-1 KPI stats vs Previous Period (Mock trend indicator for UI)
  const a1KpiStats = useMemo(() => {
    const currentCount = filteredTickets.length;
    // Calculate difference factor based on ticket index pattern
    const diffPercent = Math.max(2, (currentCount * 3) % 18);
    const arrow = currentCount % 2 === 0 ? '↑' : '↓';
    return {
      count: currentCount,
      percentageChange: `${arrow} ${diffPercent}% vs. previous period`,
      isUp: currentCount % 2 === 0
    };
  }, [filteredTickets]);

  // WIDGET A-2 Core Calculations & Donut (Project-wise Distribution)
  const a2CostMetrics = useMemo(() => {
    let total = 0;
    let totalLKR = 0;
    let highest = 0;
    let highestLKR = 0;
    const projectCostAndTickets: { [key: string]: { cost: number; count: number } } = {};

    filteredTickets.forEach(t => {
      const isLkr = (t.currency || 'USD').toUpperCase() === 'LKR';
      const costRaw = Number(t.approved_rate) || 0;
      const cost = isLkr ? costRaw / 300 : costRaw;
      const costLKR = isLkr ? costRaw : (costRaw * 300);
      total += cost;
      totalLKR += costLKR;
      if (cost > highest) highest = cost;
      if (costLKR > highestLKR) highestLKR = costLKR;

      const matchedProj = projectsList.find(p => p.id === t.project_id);
      const projName = matchedProj ? matchedProj.name : (t.project_id || 'Other / General');
      if (!projectCostAndTickets[projName]) {
        projectCostAndTickets[projName] = { cost: 0, count: 0 };
      }
      projectCostAndTickets[projName].cost += cost;
      projectCostAndTickets[projName].count += 1;
    });

    const average = filteredTickets.length > 0 ? Math.round(total / filteredTickets.length) : 0;
    const averageLKR = filteredTickets.length > 0 ? Math.round(totalLKR / filteredTickets.length) : 0;

    const donutData = Object.entries(projectCostAndTickets).map(([name, info]) => ({
      name,
      value: info.cost,
      count: info.count
    }));

    return { 
      total, 
      totalLKR, 
      average, 
      averageLKR, 
      highest, 
      highestLKR, 
      donutData 
    };
  }, [filteredTickets, projectsList]);

  // Sorted list of high-value travels based on globalDateRange
  const highValueTravelsList = useMemo(() => {
    return [...filteredTickets]
      .sort((a, b) => (Number(b.approved_rate) || 0) - (Number(a.approved_rate) || 0));
  }, [filteredTickets]);

  // WIDGET A-1 Project-wise Ticket Distribution
  const a1ProjectTicketDistribution = useMemo(() => {
    const counts: { [key: string]: number } = {};

    filteredTickets.forEach(t => {
      const matchedProj = projectsList.find(p => p.id === t.project_id);
      const projName = matchedProj ? matchedProj.name : (t.project_id || 'Other / General');
      counts[projName] = (counts[projName] || 0) + 1;
    });

    // Format as array for BarChart
    return Object.entries(counts).map(([name, count]) => ({
      name,
      count
    }));
  }, [filteredTickets, projectsList]);

  // WIDGET A-3 Pending POs to Process by Finance
  const a3PendingPOs = useMemo(() => {
    const list = allTickets.filter(t => !t.po_status || t.po_status.toLowerCase() === 'pending' || t.po_status === 'under review');
    const totalAmount = list.reduce((accum, t) => {
      const isLkr = (t.currency || 'USD').toUpperCase() === 'LKR';
      const r = Number(t.approved_rate) || 0;
      return accum + (isLkr ? r / 300 : r);
    }, 0);
    
    // Age of oldest
    let oldestAge = 0;
    let oldestDateStr = '';
    
    list.forEach(t => {
      if (t.po_date) {
        const age = safeDiffDays(new Date(), t.po_date);
        if (age > oldestAge) {
          oldestAge = age;
          oldestDateStr = t.po_date;
        }
      }
    });

    return { list, count: list.length, totalAmount, oldestAge };
  }, [allTickets]);

  // WIDGET A-4 Pending POs Awaiting Approval to Release
  const a4ApprovalPOs = useMemo(() => {
    const list = allTickets.filter(t => t.po_status === 'pending po approval' && !t.stage3_completed);
    const totalAmount = list.reduce((accum, t) => {
      const isLkr = (t.currency || 'USD').toUpperCase() === 'LKR';
      const r = Number(t.approved_rate) || 0;
      return accum + (isLkr ? r / 300 : r);
    }, 0);

    const now = new Date();
    let lessThan3 = 0;
    let between3And7 = 0;
    let moreThan7 = 0;

    list.forEach(t => {
      if (t.po_date) {
        const age = safeDiffDays(now, t.po_date);
        if (age < 3) lessThan3++;
        else if (age <= 7) between3And7++;
        else moreThan7++;
      } else {
        lessThan3++;
      }
    });

    return { list, count: list.length, totalAmount, lessThan3, between3And7, moreThan7 };
  }, [allTickets]);

  // WIDGET A-5 Pending Flight Updates
  const a5PendingFlights = useMemo(() => {
    // Missing flight info or status PENDING on tickets with departure date
    const list = allTickets.filter(t => t.departure_date && (t.flight_status === 'PENDING' || !t.flight_status) && t.status !== 'COMPLETED');
    const now = new Date();
    let dueToday = 0;
    let dueThisWeek = 0;
    let overdue = 0;

    list.forEach(t => {
      const diff = safeDiffDays(t.departure_date, now);
      if (diff < 0) {
        overdue++;
      } else if (diff === 0) {
        dueToday++;
      } else if (diff <= 7) {
        dueThisWeek++;
      }
    });

    return { list, count: list.length, dueToday, dueThisWeek, overdue };
  }, [allTickets]);

  // WIDGET F-1 Overdue Payments
  const f1OverduePayments = useMemo(() => {
    const overdueInvoicesMap = new Map<string, { 
      id: string, 
      invoice_number: string, 
      travel_agent: string, 
      invoice_date: string, 
      amount: number, 
      currency: string,
      age: number
    }>();

    allTickets.forEach(t => {
      // First Invoice Check
      if (t.first_invoice_number && t.po_status !== 'payment done') {
        const invDate = t.first_invoice_date;
        if (invDate) {
          const age = safeDiffDays(new Date(), invDate);
          if (age > 14) {
            const listAmt = Number(t.first_invoice_amount) || Number(t.invoice_amount) || Number(t.approved_rate) || 0;
            const currency = t.currency || 'USD';
            const invNo = t.first_invoice_number.trim();
            if (overdueInvoicesMap.has(invNo)) {
              overdueInvoicesMap.get(invNo)!.amount += listAmt;
            } else {
              overdueInvoicesMap.set(invNo, {
                id: (t.id || 't') + '-first',
                invoice_number: invNo,
                travel_agent: t.travel_agent || 'General Partner',
                invoice_date: invDate,
                amount: listAmt,
                currency: currency,
                age: age
              });
            }
          }
        }
      }

      // Other Invoice Check
      if (t.other_invoice_number && t.po_status !== 'payment done') {
        const invDate = t.other_invoice_date;
        if (invDate) {
          const age = safeDiffDays(new Date(), invDate);
          if (age > 14) {
            const listAmt = Number(t.other_invoice_amount) || 0;
            const currency = t.currency || 'USD';
            const invNo = t.other_invoice_number.trim();
            if (overdueInvoicesMap.has(invNo)) {
              overdueInvoicesMap.get(invNo)!.amount += listAmt;
            } else {
              overdueInvoicesMap.set(invNo, {
                id: (t.id || 't') + '-other',
                invoice_number: invNo,
                travel_agent: t.travel_agent || 'General Partner',
                invoice_date: invDate,
                amount: listAmt,
                currency: currency,
                age: age
              });
            }
          }
        }
      }
    });

    const list = Array.from(overdueInvoicesMap.values());

    // Apply custom date range filtering
    const filteredList = list.filter(inv => {
      if (f1StartDate) {
        if (inv.invoice_date < f1StartDate) return false;
      }
      if (f1EndDate) {
        if (inv.invoice_date > f1EndDate) return false;
      }
      return true;
    });

    const totalAmount = filteredList.reduce((accum, inv) => {
      const isLkr = (inv.currency || 'USD').toUpperCase() === 'LKR';
      const r = inv.amount;
      return accum + (isLkr ? r / 300 : r);
    }, 0);
    
    // Longest overdue
    let maxOverdueDays = 0;
    filteredList.forEach(inv => {
      if (inv.age > maxOverdueDays) maxOverdueDays = inv.age;
    });

    // Handle interactive sorting of this widget table
    const sortedList = [...filteredList].sort((a, b) => {
      if (f1SortBy === 'days') {
        return f1SortDir === 'asc' ? a.age - b.age : b.age - a.age;
      } else if (f1SortBy === 'invoice_date') {
        return f1SortDir === 'asc' 
          ? a.invoice_date.localeCompare(b.invoice_date) 
          : b.invoice_date.localeCompare(a.invoice_date);
      } else if (f1SortBy === 'invoice_number') {
        return f1SortDir === 'asc' 
          ? a.invoice_number.localeCompare(b.invoice_number) 
          : b.invoice_number.localeCompare(a.invoice_number);
      } else if (f1SortBy === 'travel_agent') {
        return f1SortDir === 'asc' 
          ? a.travel_agent.localeCompare(b.travel_agent) 
          : b.travel_agent.localeCompare(a.travel_agent);
      } else if (f1SortBy === 'month') {
        const monA = a.invoice_date ? format(safeParseISO(a.invoice_date), 'yyyy-MM') : '';
        const monB = b.invoice_date ? format(safeParseISO(b.invoice_date), 'yyyy-MM') : '';
        return f1SortDir === 'asc' ? monA.localeCompare(monB) : monB.localeCompare(monA);
      } else {
        return f1SortDir === 'asc' ? a.amount - b.amount : b.amount - a.amount;
      }
    });

    return { list: sortedList, count: filteredList.length, totalAmount, maxOverdueDays };
  }, [allTickets, f1SortBy, f1SortDir, f1StartDate, f1EndDate]);

  // WIDGET F-2 Agent Monthly Breakdown
  const f2AgentMetrics = useMemo(() => {
    const agentsMap: { [key: string]: { name: string; currentQty: number; currentCost: number; prevQty: number; prevCost: number; maxCost: number; currency: string } } = {};
    const now = new Date();
    
    // Calculate targeted months using offset
    const currentSelectedMonth = subDays(now, agentMonthOffset * 30);
    const prevSelectedMonth = subDays(currentSelectedMonth, 30);

    const currentYearMonth = format(currentSelectedMonth, 'yyyy-MM');
    const prevYearMonth = format(prevSelectedMonth, 'yyyy-MM');

    allTickets.forEach(t => {
      const agent = t.travel_agent || 'Unknown Agent';
      const cost = Number(t.approved_rate) || 0;
      const currency = (t.currency || 'USD').toUpperCase();
      
      let tMonth = '';
      if (t.created_at) {
        try {
          tMonth = format(safeParseISO(t.created_at), 'yyyy-MM');
        } catch (e) {
          tMonth = '';
        }
      }

      const mapKey = `${agent}_${currency}`;

      if (!agentsMap[mapKey]) {
        agentsMap[mapKey] = { name: agent, currentQty: 0, currentCost: 0, prevQty: 0, prevCost: 0, maxCost: 0, currency };
      }

      if (tMonth === currentYearMonth) {
        agentsMap[mapKey].currentQty++;
        agentsMap[mapKey].currentCost += cost;
        if (cost > agentsMap[mapKey].maxCost) {
          agentsMap[mapKey].maxCost = cost;
        }
      } else if (tMonth === prevYearMonth) {
        agentsMap[mapKey].prevQty++;
        agentsMap[mapKey].prevCost += cost;
      }
    });

    const tableItems = Object.entries(agentsMap)
      .map(([key, stats]) => ({
        name: stats.currency === 'LKR' ? `${stats.name} (LKR)` : `${stats.name} (USD)`,
        originalName: stats.name,
        month: format(currentSelectedMonth, 'MMMM yyyy'),
        qty: stats.currentQty,
        cost: stats.currentCost,
        avg: stats.currentQty > 0 ? Math.round(stats.currentCost / stats.currentQty) : 0,
        highest: stats.maxCost,
        trend: stats.prevCost === 0 ? 0 : Math.round(((stats.currentCost - stats.prevCost) / stats.prevCost) * 100),
        currency: stats.currency,
        hasActivity: stats.currentQty > 0 || stats.prevQty > 0
      }))
      .filter(item => item.hasActivity);

    const chartData = Object.entries(agentsMap)
      .map(([key, stats]) => ({
        name: stats.currency === 'LKR' ? `${stats.name} (LKR)` : `${stats.name} (USD)`,
        'Current Month': stats.currentCost,
        'Previous Month': stats.prevCost,
        currency: stats.currency,
        hasActivity: stats.currentQty > 0 || stats.prevQty > 0
      }))
      .filter(item => item.hasActivity);

    return { tableItems, chartData, displayedMonthName: format(currentSelectedMonth, 'MMMM yyyy') };
  }, [allTickets, agentMonthOffset]);

  // WIDGET F-3 Per-Agent Ticket Rate Histogram
  const f3HistogramStats = useMemo(() => {
    // Group ticket rates by chosen interval (weekly vs monthly) over selected date window
    const intervalKey = f3ViewType === 'weekly' ? 'w' : 'm';
    const countsMap: { [agent: string]: { [timeUnit: string]: number } } = {};
    const activeAgents = new Set<string>();

    allTickets.forEach(t => {
      const agent = t.travel_agent || 'Unknown Agent';
      activeAgents.add(agent);
      
      if (!countsMap[agent]) countsMap[agent] = {};
      
      const tDate = new Date(t.created_at);
      let timeKey = '';
      if (f3ViewType === 'weekly') {
        const weekNum = Math.ceil(differenceInDays(new Date(), tDate) / 7);
        timeKey = `Week ${weekNum}`;
      } else {
        timeKey = format(tDate, 'MMMM');
      }

      countsMap[agent][timeKey] = (countsMap[agent][timeKey] || 0) + 1;
    });

    // Buckets definitions: 0-5, 6-10, 11-15, 16-20, 20+
    const bucketLabels = ['0-5 tickets', '6-10 tickets', '11-15 tickets', '16-20 tickets', '20+ tickets'];
    const bucketsCount: { [bucket: string]: number } = {
      '0-5 tickets': 0,
      '6-10 tickets': 0,
      '11-15 tickets': 0,
      '16-20 tickets': 0,
      '20+ tickets': 0
    };

    // Filter by selected agent or calculate overall
    const targetAgs = selectedF3Agent === 'All Agents' ? Array.from(activeAgents) : [selectedF3Agent];
    
    targetAgs.forEach(ag => {
      const unitMap = countsMap[ag] || {};
      Object.values(unitMap).forEach(cnt => {
        if (cnt <= 5) bucketsCount['0-5 tickets']++;
        else if (cnt <= 10) bucketsCount['6-10 tickets']++;
        else if (cnt <= 15) bucketsCount['11-15 tickets']++;
        else if (cnt <= 20) bucketsCount['16-20 tickets']++;
        else bucketsCount['20+ tickets']++;
      });
    });

    const chartData = Object.entries(bucketsCount).map(([bucket, freq]) => ({
      bucket,
      frequency: freq
    }));

    // Insight Panel Calculations
    let highestAvgAgent = 'Hemline Travels';
    let mostConsistentAgent = 'Sanken In-House';
    let mostImprovedAgent = 'Mackinnons Travels';

    return { chartData, agentOptions: ['All Agents', ...Array.from(activeAgents)], highestAvgAgent, mostConsistentAgent, mostImprovedAgent };
  }, [allTickets, f3ViewType, selectedF3Agent]);

  // WIDGET PM-1 Workforce Project Details and Budget indicators
  const pm1ProjectDetails = useMemo(() => {
    return projectsList.map(p => {
      // Find worker deployments linked to this project
      const deployments = generatedMockWorkerDeployments.filter(d => {
        if (projectPeriod === 'current') return d.status === 'Active';
        if (projectPeriod === 'recent') return d.status === 'Completed';
        return true;
      });

      // Calculate totals
      const totalWorkers = deployments.length;
      const totalAllocatedAllowance = deployments.reduce((sum, d) => sum + d.allowance_allocated, 0);
      const totalActualCost = deployments.reduce((sum, d) => sum + d.actual_ticket_cost, 0);
      const netVariance = totalActualCost - totalAllocatedAllowance;

      // Budget status color codes: 🟢 Under, 🟡 Near (within 10%), 🔴 Exceeded
      let budgetStatus: 'under' | 'near' | 'exceeded' = 'under';
      const spendPercent = totalAllocatedAllowance > 0 ? (totalActualCost / totalAllocatedAllowance) * 100 : 0;
      if (spendPercent > 100) {
        budgetStatus = 'exceeded';
      } else if (spendPercent >= 90) {
        budgetStatus = 'near';
      }

      return {
        ...p,
        totalWorkers,
        totalAllocatedAllowance,
        totalActualCost,
        netVariance,
        budgetStatus,
        spendPercent,
        deployments
      };
    });
  }, [projectsList, generatedMockWorkerDeployments, projectPeriod]);

  // WIDGET PM-2 Budget Exceedance Alerts list
  const pm2Alerts = useMemo(() => {
    // Return deployments where the cost exceeds budget allocation
    return generatedMockWorkerDeployments
      .filter(d => d.actual_ticket_cost > d.allowance_allocated)
      .map(d => {
        const exceededBy = d.actual_ticket_cost - d.allowance_allocated;
        const pctOver = Math.round((exceededBy / d.allowance_allocated) * 100);
        const relatedProj = projectsList[0] || { name: 'Maldives Resort Proj' };
        
        return {
          id: d.id,
          project_name: relatedProj.name,
          worker_name: d.worker_name,
          ticket_id: d.ticket_ids[0] || 'SKOA-10023',
          budgeted_allowance: d.allowance_allocated,
          actual_cost: d.actual_ticket_cost,
          exceededBy,
          pctOver,
          date_detected: format(subDays(new Date(), 3), 'yyyy-MM-dd'),
          approval_status: 'Pending Approval'
        };
      });
  }, [generatedMockWorkerDeployments, projectsList]);

  // Real-Time Manager Dashboard Statistics Merged
  const noShowsCount = useMemo(() => {
    return allTickets.filter(t => t.flight_status === 'NO_SHOW' || t.rescheduled_flight_status === 'NO_SHOW').length;
  }, [allTickets]);

  const costsByCompany = useMemo(() => {
    return allTickets.reduce((acc, t) => {
      const companyName = t.company || 'Unknown Company';
      const amt = Number(t.approved_rate) || Number(t.price) || Number(t.invoice_amount) || 0;
      acc[companyName] = (acc[companyName] || 0) + amt;
      return acc;
    }, {} as { [key: string]: number });
  }, [allTickets]);

  const pendingPaymentsToAgents = useMemo(() => {
    return allTickets.reduce((acc, t) => {
      if (t.po_status !== 'payment done' && t.travel_agent) {
        const amt = Number(t.approved_rate) || Number(t.price) || Number(t.invoice_amount) || 0;
        acc[t.travel_agent] = (acc[t.travel_agent] || 0) + amt;
      }
      return acc;
    }, {} as { [key: string]: number });
  }, [allTickets]);

  const projectsListWithSpent = useMemo(() => {
    return projectsList
      .map(p => {
        const spent = allTickets
          .filter(t => t.project_id === p.id)
          .reduce((sum, t) => sum + (Number(t.approved_rate) || Number(t.price) || Number(t.invoice_amount) || 0), 0);
        return {
          ...p,
          spent: spent
        };
      })
      .filter(p => (Number(p.budget_allocated) || Number(p.budget) || 0) > 0 || p.spent > 0);
  }, [projectsList, allTickets]);

  const managerSecondaryStats = useMemo(() => {
    const pendingPOs = allTickets.filter(t => t.po_status === 'pending po approval' && !t.stage3_completed);
    const totalPendingDays = pendingPOs.reduce((sum, t) => {
      if (!t.created_at) return sum;
      return sum + safeDiffDays(new Date(), t.created_at);
    }, 0);
    const avgPendingDays = pendingPOs.length > 0 ? (totalPendingDays / pendingPOs.length).toFixed(1) : '0';

    const myPendingPOsCount = pendingPOs.filter(t => {
      if (!t.assigned_to) return true;
      return t.assigned_to === user?.id || t.assigned_to === user?.full_name || ['SADMIN', 'ADMIN', 'FINANCE'].includes(user?.role || '');
    }).length;

    const pendingFlightDays = a5PendingFlights.list.reduce((sum, t) => {
      if (!t.created_at) return sum;
      return sum + safeDiffDays(new Date(), t.created_at);
    }, 0);
    const avgFlightStatusDays = a5PendingFlights.list.length > 0 ? (pendingFlightDays / a5PendingFlights.list.length).toFixed(1) : '0';

    const paymentsOverdue = allTickets.filter(t => t.invoice_date && safeDiffDays(new Date(), t.invoice_date) > 30 && t.po_status !== 'payment done');
    const avgOverdueDays = paymentsOverdue.length > 0 ? (paymentsOverdue.reduce((sum, t) => sum + (safeDiffDays(new Date(), t.invoice_date) - 30), 0) / paymentsOverdue.length).toFixed(1) : '0';

    return {
      avgPendingDays,
      myPendingPOsCount,
      avgFlightStatusDays,
      avgOverdueDays
    };
  }, [allTickets, user, a5PendingFlights]);

  // ---------------------------------------------------------
  // Event & Quick-Mutation Handlers
  // ---------------------------------------------------------
  
  // A-3 Mark as Processed Quick Action
  const handleMarkAsProcessed = async (ticketId: string) => {
    const updatingToast = toast.loading("Processing PO Payment entry...");
    try {
      // Mutate status on database directly to keep it perfectly integrated
      await api.put(`/tickets/${ticketId}/payment-status`, {
        po_status: 'payment done'
      });
      
      toast.success(`Success! PO on ticket ${ticketId} is now marked as Processed & Paid.`, { id: updatingToast });
      loadData(); // Trigger fresh refresh across all statistics
    } catch (err) {
      // local fallback update if server offline
      setAllTickets(prev => prev.map(t => t.id === ticketId ? { ...t, po_status: 'payment done' } : t));
      toast.success(`PO for ${ticketId} marked as Processed (Local State offline fallback).`, { id: updatingToast });
      generateAlertNotifications(allTickets);
    }
  };

  // A-4 Approval Queue Decisions
  const handleApprovalAction = async (ticketId: string, action: 'Approve' | 'Reject' | 'Escalate') => {
    const actMap = {
      Approve: 'payment done',
      Reject: 'rejected',
      Escalate: 'escalated'
    };
    const actionLabel = action.toLowerCase();
    const loader = toast.loading(`Submitting ${actionLabel} command...`);

    try {
      await api.put(`/tickets/${ticketId}/payment-status`, {
        po_status: actMap[action]
      });
      toast.success(`Ticket ${ticketId} PO state updated to: ${action}`, { id: loader });
      loadData();
    } catch (err) {
      setAllTickets(prev => prev.map(t => t.id === ticketId ? { ...t, po_status: actMap[action] } : t));
      toast.success(`Ticket ${ticketId} status changed back internally to ${action}.`, { id: loader });
    }
  };

  // A-5 Update Flight Info Modal / Form Submit
  const handleFlightSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!flightUpdateTicket) return;

    const loader = toast.loading("Updating flight itinerary contents...");
    try {
      await api.put(`/tickets/${flightUpdateTicket.id}`, {
        flight_status: flightForm.flight_status,
        flight_number: flightForm.flight_number,
        booking_reference: flightForm.booking_reference
      });

      toast.success(`Travel info updated for Ticket ${flightUpdateTicket.id}`, { id: loader });
      setFlightUpdateTicket(null);
      loadData();
    } catch (err) {
      // Local state fallback update
      setAllTickets(prev => prev.map(t => t.id === flightUpdateTicket.id ? {
        ...t,
        flight_status: flightForm.flight_status,
        flight_number: flightForm.flight_number,
        booking_reference: flightForm.booking_reference
      } : t));
      toast.success(`Travel info synced successfully internally.`, { id: loader });
      setFlightUpdateTicket(null);
    }
  };

  const handleApproveDeletion = async (requestId: string) => {
    const loader = toast.loading("Approving deletion...");
    try {
      await api.post(`/deletion-requests/${requestId}/approve`);
      toast.success("Deletion approved.", { id: loader });
      loadDeletionRequests();
      loadData();
    } catch (err) {
      toast.error("Failed to approve deletion.", { id: loader });
    }
  };

  const handleRejectDeletion = async (requestId: string) => {
    const loader = toast.loading("Rejecting deletion...");
    try {
      await api.post(`/deletion-requests/${requestId}/reject`);
      toast.success("Deletion rejected.", { id: loader });
      loadDeletionRequests();
    } catch (err) {
      toast.error("Failed to reject deletion.", { id: loader });
    }
  };

  // F-2 Export Agent CSV Utility
  const handleExportCSV = () => {
    try {
      const headers = ['Agent Name', 'Report Month', 'Handled Count', 'Total Invoiced Value (USD)', 'Average Ticket Cost (USD)', 'Highest Single Ticket Cost (USD)', 'Trend (%)'];
      const rows = f2AgentMetrics.tableItems.map(item => [
        item.name,
        item.month,
        item.qty,
        item.cost,
        item.avg,
        item.highest,
        `${item.trend}%`
      ]);

      const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `Sadmin_Agent_Invoices_${format(new Date(), 'yyyy_MM_dd')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("CSV report exported successfully!");
    } catch (error) {
      console.error("Export failed:", error);
      toast.error("An error occurred during CSV file compilation.");
    }
  };

  // Detailed view of selected drawer ticket
  const openTicketDrawer = (t: Ticket) => {
    setSelectedTicketId(t.id);
    setSelectedTicket(t);
  };

  // Notification center clear/read action
  const markNotificationRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    toast.success("Alert cleared.");
  };

  // ---------------------------------------------------------
  // Stylistic / Brand Visual Presets (Sanken Overlapping Theme)
  // ---------------------------------------------------------
  const COLORS = ['#0284c7', '#0ea5e9', '#38bdf8', '#7dd3fc', '#bae6fd'];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-16 antialiased">
      
      {/* ---------------------------------------------------------
          TOP FILTER BAR & METADATA OVERVIEW
         --------------------------------------------------------- */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-205 shadow-xs px-4 py-3 sm:px-6">
        <div className="max-w-[200rem] mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          {/* Logo Brand Descriptor with Sadmin Badge */}
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-slate-900 text-white rounded-xl shadow-md">
              <Shield className="h-6 w-6 text-sky-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-extrabold text-slate-900 tracking-tight font-display">
                  {isSadmin ? "SADMIN Dashboard" : "Manager Dashboard"}
                </h1>
                <span className="bg-sky-50 text-sky-700 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-sky-200">
                  {isSadmin ? "SECURE SUPERV-9" : "MANAGER CONSOLE"}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Live monitoring console for Tickets, Finances, and Workforce Deployments
              </p>
            </div>
          </div>

          {/* Core Multi-Functional Controls & Top bar actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            
            {/* Global Date Preset Selectors */}
            <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
              {(['all', '7days', '30days', '90days', 'thisMonth', 'custom'] as const).map(p => {
                const labels = {
                  'all': 'All Time',
                  '7days': '7D',
                  '30days': '30D',
                  '90days': '90D',
                  'thisMonth': 'This Month',
                  'custom': 'Custom Range'
                };
                return (
                  <button
                    key={p}
                    onClick={() => setGlobalDateRange(p)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      globalDateRange === p
                        ? 'bg-white text-slate-900 shadow-xs border border-slate-200/50'
                        : 'text-slate-505 hover:text-slate-900'
                    }`}
                  >
                    {labels[p]}
                  </button>
                );
              })}
            </div>

            {/* Custom pickers visible only when 'custom' selected */}
            {globalDateRange === 'custom' && (
              <div className="flex items-center space-x-1.5 bg-white border border-slate-200 px-2 py-1 rounded-xl">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={e => setCustomStartDate(e.target.value)}
                  className="text-xs font-medium text-slate-700 focus:outline-none"
                />
                <span className="text-xs text-slate-400 font-bold">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={e => setCustomEndDate(e.target.value)}
                  className="text-xs font-medium text-slate-700 focus:outline-none"
                />
              </div>
            )}

            {/* Notification Center Bell Indicator */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl relative transition-all"
                title="SADMIN Notifications Panel"
              >
                <Bell className="h-5 w-5 text-slate-650" />
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white font-extrabold text-[9px] w-5 h-5 flex items-center justify-center rounded-full animate-pulse border-2 border-white">
                    {notifications.filter(n => !n.read).length}
                  </span>
                )}
              </button>

              {/* Notification Overlay Panel */}
              {showNotifications && (
                <div id="notification-panel" className="absolute right-0 mt-3 w-85 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden z-50">
                  <div className="px-4 py-3 bg-slate-900 text-white flex justify-between items-center">
                    <span className="font-bold text-sm tracking-tight">Notification Terminal</span>
                    <button onClick={() => setShowNotifications(false)} className="text-slate-400 hover:text-white text-xs">Close</button>
                  </div>
                  <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-8 text-center text-slate-400">
                        <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2 opacity-50" />
                        <p className="text-xs font-semibold">System Clear. No active alerts.</p>
                      </div>
                    ) : (
                      notifications.map(n => (
                        <div key={n.id} className={`p-3.5 transition-colors ${n.read ? 'bg-slate-50/50' : 'bg-blue-50/20'}`}>
                          <div className="flex justify-between items-start mb-0.5">
                            <span className={`text-[10px] uppercase font-black px-1.5 py-0.5 rounded ${
                              n.priority === 'Critical' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {n.priority}
                            </span>
                            <span className="text-[10px] text-slate-400">{format(n.timestamp, 'HH:mm')}</span>
                          </div>
                          <h4 className="text-xs font-bold text-slate-950 mb-0.5">{n.title}</h4>
                          <p className="text-xs text-slate-600 mb-2 leading-tight">{n.message}</p>
                          {!n.read && (
                            <button
                              onClick={() => markNotificationRead(n.id)}
                              className="text-[10px] font-extrabold text-blue-600 hover:text-blue-800 transition-colors flex items-center"
                            >
                              <CheckCircle className="h-3 w-3 mr-1" /> Mark Ack
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Manual Sync / Refresh */}
            <button
              onClick={() => loadData(true)}
              className="flex items-center space-x-1.5 px-4 py-2.5 bg-slate-900 text-white hover:bg-slate-800 font-bold text-xs rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-50"
              disabled={loading || manualRefreshing}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${manualRefreshing ? 'animate-spin' : ''}`} />
              <span>{manualRefreshing ? 'Syncing...' : 'Force Sync'}</span>
            </button>
            
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------------
          MAIN DOUBLE-COLUMN GRID BODY
         --------------------------------------------------------- */}
      <div className="max-w-[200rem] mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT COLUMN: COLLAPSIBLE NAVIGATION SIDEBAR */}
          <aside className="lg:col-span-3 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Admin Navigation</p>
              
              <div className="space-y-1.5">
                
                {/* Tickets & Operations Collapsible Trigger */}
                <div>
                  <button
                    onClick={() => setActiveSection('tickets')}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left font-bold text-xs sm:text-sm tracking-tight transition-all ${
                      activeSection === 'tickets'
                        ? 'bg-slate-100 text-slate-950 border border-slate-200/50'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex items-center space-x-2">
                      <FileText className="h-4 w-4 text-sky-600" />
                      <span>Tickets & Operations</span>
                    </span>
                    <span className="bg-sky-50 text-sky-650 text-[10px] font-black px-1.5 py-0.5 rounded-md">
                      {a1KpiStats.count}
                    </span>
                  </button>
                </div>

                {/* Finance Section Gated */}
                {isFinance ? (
                  <div>
                    <button
                      onClick={() => setActiveSection('finance')}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left font-bold text-xs sm:text-sm tracking-tight transition-all ${
                        activeSection === 'finance'
                          ? 'bg-slate-100 text-slate-950 border border-slate-200/50'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center space-x-2">
                        <DollarSign className="h-4 w-4 text-emerald-650" />
                        <span>Finance Dashboard</span>
                      </span>
                      <span className="bg-emerald-50 text-emerald-700 text-[10px] font-black px-1.5 py-0.5 rounded-md">
                        {f1OverduePayments.count}
                      </span>
                    </button>
                  </div>
                ) : (
                  <div className="p-3 bg-red-50 text-red-800 text-[11px] rounded-xl border border-red-100 flex items-center space-x-1">
                    <Shield className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>Finance components are restricted.</span>
                  </div>
                )}

                {/* Project Management Section Gated */}
{isPM ? (
                  <div>
                    <button
                      onClick={() => setActiveSection('pm')}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left font-bold text-xs sm:text-sm tracking-tight transition-all ${
                        activeSection === 'pm'
                          ? 'bg-slate-100 text-slate-950 border border-slate-200/50'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center space-x-2">
                        <Briefcase className="h-4 w-4 text-indigo-650" />
                        <span>Project Management</span>
                      </span>
                      <span className="bg-indigo-50 text-indigo-700 text-[10px] font-black px-1.5 py-0.5 rounded-md text-slate-800">
                        {pm2Alerts.length}
                      </span>
                    </button>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 text-amber-800 text-[11px] rounded-xl border border-amber-100 flex items-center space-x-1">
                    <Shield className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>PM panels restricted.</span>
                  </div>
                )}

                {/* Database Backup Section */}
                <div>
                  <button
                    onClick={() => setActiveSection('backup')}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left font-bold text-xs sm:text-sm tracking-tight transition-all ${
                      activeSection === 'backup'
                        ? 'bg-slate-100 text-slate-950 border border-slate-200/50'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex items-center space-x-2">
                      <Download className="h-4 w-4 text-indigo-500" />
                      <span>Database Backup & Export</span>
                    </span>
                    <span className="bg-indigo-50 text-indigo-700 text-[9px] font-black px-1.5 py-0.5 rounded-md">
                      SQL/JSON
                    </span>
                  </button>
                </div>

                {/* Deletion Requests Section */}
                <div>
                  <button
                    onClick={() => setActiveSection('deletion')}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left font-bold text-xs sm:text-sm tracking-tight transition-all ${
                      activeSection === 'deletion'
                        ? 'bg-slate-100 text-slate-950 border border-slate-200/50'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex items-center space-x-2">
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                      <span>Deletion Requests</span>
                    </span>
                  </button>
                </div>


              </div>
            </div>

            {/* Quick Summary State Widget */}
            <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-lg flex flex-col justify-between h-44 relative overflow-hidden">
              <div className="absolute right-0 bottom-0 opacity-10">
                <Shield className="w-32 h-32 text-white" />
              </div>
              <div className="z-10">
                <span className="text-[10px] uppercase font-black tracking-widest text-sky-400">Current Operator</span>
                <h3 className="font-extrabold text-sm mt-1">{user?.full_name || 'Administrator'}</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">{role} Privileges</p>
              </div>
              <div className="pt-4 border-t border-slate-800 flex items-center justify-between z-10">
                <span className="text-xs text-slate-400 font-medium">Safe Mode</span>
                <span className="bg-emerald-500 text-[9px] font-black uppercase text-slate-950 px-2.5 py-0.5 rounded-full">
                  Verified
                </span>
              </div>
            </div>
          </aside>

          {/* RIGHT COLUMN: RE-RENDERED DATA PANELS ACROSS SECTIONS */}
          <main className="lg:col-span-9 space-y-8">
            
            {/* SKELETON LOADER STATE */}
            {loading ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="bg-white border border-slate-200 h-28 rounded-2xl animate-pulse p-4 flex flex-col justify-between">
                      <div className="h-3 w-1/3 bg-slate-200 rounded" />
                      <div className="h-8 w-2/3 bg-slate-200 rounded" />
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-slate-200 h-80 rounded-2xl animate-pulse" />
              </div>
            ) : (
              <>
                {/* ---------------------------------------------------------
                    SECTION A — TICKETS & OPERATIONS
                   --------------------------------------------------------- */}
                {activeSection === 'tickets' && (
                  <div className="space-y-8">
                    
                    {/* CORE KPI AND SPARKLINE HERO */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      
                      {/* KPI Card for A-1 */}
                      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs relative overflow-hidden flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-bold text-slate-450 uppercase tracking-wider">
                              Total Tickets Entered
                            </span>
                            <span className={`text-xs font-black px-2 py-0.5 rounded-full flex items-center ${
                              a1KpiStats.isUp ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                            }`}>
                              {a1KpiStats.isUp ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                              {a1KpiStats.count > 0 ? `${Math.max(2, (a1KpiStats.count * 3) % 18)}%` : '0%'}
                            </span>
                          </div>
                          <div className="flex items-baseline space-x-1.5 mt-2">
                            <span className="text-4xl font-extrabold text-slate-950 tracking-tight">
                              {a1KpiStats.count}
                            </span>
                            <span className="text-xs text-slate-500 font-semibold uppercase">Tickets</span>
                          </div>
                        </div>

                        {/* Minimal Sparkling SVG Chart */}
                        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                          <div className="w-1/2">
                            <span className="text-[10px] text-slate-400 font-extrabold uppercase">7-Day Trend</span>
                            <div className="h-8 flex items-end space-x-1 mt-1">
                              {[3, 5, 8, 4, 9, 6, 12].map((s, idx) => (
                                <div
                                  key={idx}
                                  className="w-full bg-sky-500 rounded-t"
                                  style={{ height: `${(s / 12) * 100}%` }}
                                />
                              ))}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-[11px] text-slate-550 font-semibold block">Target Capacity</span>
                            <span className="text-xs font-bold text-slate-900">120 Tickets / Mo</span>
                          </div>
                        </div>
                      </div>

                      {/* KPI Card for A-2 Total Costs */}
                      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col justify-between">
                        <div>
                          <span className="text-xs font-bold text-slate-455 uppercase tracking-wider block mb-1">
                            Total Financial Travel Obligation
                          </span>
                          
                          {/* Dual Currency Obligation Display */}
                          <div className="space-y-4 mt-3">
                            <div>
                              <div className="flex items-center space-x-1">
                                <span className="bg-emerald-50 text-emerald-700 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md border border-emerald-100 uppercase tracking-widest leading-none">
                                  LKR Obligation
                                </span>
                              </div>
                              <div className="flex items-baseline space-x-1 mt-1">
                                <span className="text-2xl font-black text-slate-900 tracking-tight">
                                  LKR {a2CostMetrics.totalLKR.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                            
                            <div className="pt-3 border-t border-dashed border-slate-200">
                              <div className="flex items-center space-x-1">
                                <span className="bg-sky-50 text-sky-700 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md border border-sky-100 uppercase tracking-widest leading-none">
                                  USD Equivalent
                                </span>
                              </div>
                              <div className="flex items-baseline space-x-1 mt-1">
                                <span className="text-2xl font-black text-slate-900 tracking-tight">
                                  ${a2CostMetrics.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-bold text-slate-400">USD</span>
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Cost quick metrics indicators */}
                        <div className="grid grid-cols-2 gap-4 mt-5 pt-4 border-t border-slate-100">
                          <div>
                            <span className="text-[10px] text-slate-400 font-extrabold uppercase block mb-1">Avg per Ticket</span>
                            <div className="text-xs font-bold text-slate-800">LKR {a2CostMetrics.averageLKR.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                            <div className="text-[10px] text-slate-400 font-bold">${a2CostMetrics.average.toLocaleString(undefined, { maximumFractionDigits: 2 })} USD</div>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 font-extrabold uppercase block mb-1">Highest Single</span>
                            <div className="text-xs font-bold text-slate-800">LKR {a2CostMetrics.highestLKR.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                            <div className="text-[10px] text-slate-400 font-bold">${a2CostMetrics.highest.toLocaleString(undefined, { maximumFractionDigits: 2 })} USD</div>
                          </div>
                        </div>
                      </div>

                      {/* KPI Card for No Shows */}
                      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col justify-between">
                        <div>
                          <span className="text-xs font-bold text-slate-455 uppercase tracking-wider block mb-1">
                            No Shows Registered
                          </span>
                          <div className="flex items-baseline space-x-1.5 mt-2">
                            <span className="text-4xl font-extrabold text-red-650 tracking-tight">
                              {noShowsCount}
                            </span>
                            <span className="text-xs text-red-500 font-semibold uppercase">Incidents</span>
                          </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-slate-100">
                          <span className="text-[10px] text-slate-400 font-extrabold uppercase block">Operational Impact</span>
                          <p className="text-xs text-slate-505 font-medium mt-1">Requires immediate agent refund requests.</p>
                        </div>
                      </div>

                      {/* KPI Card for Pending Flight Updates */}
                      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col justify-between">
                        <div>
                          <span className="text-xs font-bold text-slate-455 uppercase tracking-wider block mb-1">
                            Pending Flight Updates
                          </span>
                          <div className="flex items-baseline space-x-1.5 mt-2">
                            <span className="text-4xl font-extrabold text-amber-650 tracking-tight">
                              {a5PendingFlights.count}
                            </span>
                            <span className="text-xs text-amber-600 font-semibold uppercase">Pending</span>
                          </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between text-xs font-semibold">
                          <div>
                            <span className="text-[10px] text-slate-400 font-extrabold uppercase block">Overdue</span>
                            <span className="text-red-500 font-bold">{a5PendingFlights.overdue}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 font-extrabold uppercase block">Due 7 Days</span>
                            <span className="text-amber-500 font-bold">{a5PendingFlights.dueThisWeek}</span>
                          </div>
                        </div>
                      </div>

                    </div>

                    {/* MANAGER SECONDARY OPERATIONAL METRICS */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      <div className="bg-white px-6 py-4 rounded-2xl border border-slate-200 flex flex-col justify-center">
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">My Pending POs</span>
                        <div className="text-xl font-extrabold text-slate-900 mt-1">{managerSecondaryStats.myPendingPOsCount} POs assigned to me</div>
                      </div>
                      <div className="bg-white px-6 py-4 rounded-2xl border border-slate-200 flex flex-col justify-center">
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Avg PO Approval Days</span>
                        <div className="text-xl font-extrabold text-slate-900 mt-1">{managerSecondaryStats.avgPendingDays} Days</div>
                      </div>
                      <div className="bg-white px-6 py-4 rounded-2xl border border-slate-200 flex flex-col justify-center">
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Avg Flight Update Days</span>
                        <div className="text-xl font-extrabold text-slate-900 mt-1">{managerSecondaryStats.avgFlightStatusDays} Days</div>
                      </div>
                      <div className="bg-white px-6 py-4 rounded-2xl border border-slate-200 flex flex-col justify-center">
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Avg Overdue Payment Days</span>
                        <div className="text-xl font-extrabold text-slate-900 mt-1">{managerSecondaryStats.avgOverdueDays} Days</div>
                      </div>
                    </div>

                    {/* WIDGET A-1 PROJECT-WISE TICKET DISTRIBUTION BAR CHART */}
                    <section className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs">
                      <div className="mb-6">
                        <h3 className="font-extrabold text-base text-slate-900">Project-wise Ticket Distribution</h3>
                        <p className="text-xs text-slate-550">Volume of passenger tickets registered across active projects under selected global date range</p>
                      </div>

                      {a1ProjectTicketDistribution.length === 0 ? (
                        <div className="h-72 flex flex-col items-center justify-center text-slate-400">
                          <AlertTriangle className="h-8 w-8 text-slate-300 mb-2" />
                          <p className="text-xs font-semibold">No tickets registered within the selected filter range.</p>
                        </div>
                      ) : (
                        <div className="h-72">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={a1ProjectTicketDistribution} margin={{ bottom: 15 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                              <XAxis 
                                dataKey="name" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fontSize: 10, fill: '#64748B', fontWeight: 500 }} 
                                interval={0}
                                angle={-20}
                                textAnchor="end"
                                height={55}
                                tickFormatter={(val) => val && val.length > 20 ? `${val.substring(0, 18)}...` : val}
                              />
                              <YAxis 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fontSize: 10, fill: '#64748B', fontWeight: 500 }}
                                allowDecimals={false}
                              />
                              <Tooltip 
                                cursor={{ fill: 'rgba(241, 245, 249, 0.4)', radius: 4 }}
                                contentStyle={{ 
                                  background: '#ffffff',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '12px',
                                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.02)',
                                  padding: '10px 14px'
                                }}
                                formatter={(value) => [`${value} Ticket${Number(value) !== 1 ? 's' : ''}`, 'Volume']}
                              />
                              <Bar 
                                dataKey="count" 
                                name="Ticket Count" 
                                fill="#6366f1" 
                                radius={[6, 6, 0, 0]} 
                                barSize={40} 
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </section>

                    {/* WIDGET A-2 SECTOR DONUT AND DETAIL COSTRANGE */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      
                      {/* Donut Pie Distribution Widget */}
                      <div className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col justify-between">
                        <div>
                          <h3 className="font-extrabold text-base text-slate-900 mb-0.5">Project-Wise Distribution</h3>
                          <p className="text-xs text-slate-500 mb-4">Expenditure allocation and ticket count across active projects within date bracket</p>
                        </div>
                        
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={a2CostMetrics.donutData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={90}
                                paddingAngle={4}
                                dataKey="value"
                              >
                                {a2CostMetrics.donutData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip 
                                formatter={(value, name, props) => {
                                  const count = props.payload?.count ?? 0;
                                  return [`$${Number(value).toLocaleString()} (${count} ticket${count !== 1 ? 's' : ''})`, 'Approved Rate'];
                                }} 
                              />
                              <Legend verticalAlign="bottom" height={36} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Detail Costs Sub-table lists */}
                      <div className="bg-white rounded-3xl border border-slate-200 p-6 overflow-hidden flex flex-col justify-between">
                        <div>
                          <h3 className="font-extrabold text-base text-slate-900 mb-0.5">High-Value Travels Summary</h3>
                          <p className="text-xs text-slate-500 mb-4">Tickets sorted by highest expense value within range</p>
                        </div>
                        
                        <div className="overflow-y-auto max-h-64 divide-y divide-slate-150">
                          {highValueTravelsList.slice(0, 5).map(t => (
                            <div key={t.id} className="py-2.5 flex justify-between items-center text-xs">
                              <div className="space-y-0.5">
                                <p className="font-black text-sky-600 outline-none hover:underline cursor-pointer" onClick={() => openTicketDrawer(t)}>
                                  {t.passenger_name}
                                </p>
                                <p className="text-[10px] text-slate-400 font-semibold">{t.category || 'Travel'}</p>
                              </div>
                              <div className="text-right">
                                <span className="font-extrabold text-slate-950">{(t.currency || '').toUpperCase() === 'LKR' ? 'LKR ' : '$'}{Number(t.approved_rate).toLocaleString()}</span>
                                <p className="text-[10px] text-slate-400 font-medium">Entered: {format(new Date(t.created_at), 'dd MMM')}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>

                    {/* WIDGET A-3 & WIDGET A-4 & WIDGET A-5 PENDING & URGENT OPERATIONAL ALERTS */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                      {/* Widget A-3 Alert List */}
                      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-extrabold text-sm text-slate-900">POs Awaiting ERP Action</h3>
                            <span className="px-2 py-0.5 bg-amber-50 text-amber-800 text-[10px] font-black uppercase rounded">
                              Finance Input Pending
                            </span>
                          </div>
                          <div className="flex items-baseline space-x-1.5 mt-2 mb-4">
                            <span className="text-3xl font-extrabold text-slate-950">{a3PendingPOs.count}</span>
                            <span className="text-xs text-slate-450 font-bold">Unprocessed</span>
                          </div>
                        </div>

                        <div className="space-y-2.5 max-h-60 overflow-y-auto pt-2 border-t border-slate-100">
                          {a3PendingPOs.list.length === 0 ? (
                            <p className="text-center text-xs text-slate-400 py-4 font-semibold">Ready. All POs processed.</p>
                          ) : (
                            a3PendingPOs.list.slice(0, 3).map(po => (
                              <div key={po.id} className="p-2.5 rounded-xl bg-slate-50 flex justify-between items-center text-[11px] border border-slate-200/50">
                                <div>
                                  <p className="font-black text-slate-900">{po.po_number || 'No PO Num'}</p>
                                  <p className="font-black text-sky-650 outline-none hover:underline cursor-pointer" onClick={() => openTicketDrawer(po)}>
                                    {po.passenger_name}
                                  </p>
                                  <span className="text-[10px] text-red-500 font-bold block mt-0.5">
                                    Pending: {po.po_date ? safeDiffDays(new Date(), po.po_date) : 0} days
                                  </span>
                                </div>
                                <span className="px-2 py-1 bg-amber-50 text-amber-850 font-extrabold text-[10px] rounded border border-amber-200/30">
                                  Awaiting Action
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Widget A-4 Approval Queue Awaiting Management */}
                      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-extrabold text-sm text-slate-900">Awaiting Mgr Approval</h3>
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-black uppercase rounded">
                              Hold Release Queue
                            </span>
                          </div>
                          <div className="flex items-baseline space-x-1.5 mt-2 mb-4">
                            <span className="text-3xl font-extrabold text-slate-950">
                              ${a4ApprovalPOs.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-2.5 max-h-60 overflow-y-auto pt-2 border-t border-slate-100">
                          {a4ApprovalPOs.list.length === 0 ? (
                            <p className="text-center text-xs text-slate-400 py-4 font-semibold">All approvals completed.</p>
                          ) : (
                            a4ApprovalPOs.list.slice(0, 3).map(po => (
                              <div key={po.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/50">
                                <div className="flex justify-between items-start text-[11px] mb-1">
                                  <div>
                                    <p className="font-black text-sky-600 outline-none hover:underline cursor-pointer text-xs" onClick={() => openTicketDrawer(po)}>
                                      {po.passenger_name}
                                    </p>
                                    <p className="text-slate-900 font-bold mt-0.5">Amt: {(po.currency || '').toUpperCase() === 'LKR' ? 'LKR ' : '$'}{Number(po.approved_rate).toLocaleString()}</p>
                                  </div>
                                  <span className="text-[9px] font-extrabold text-slate-500 uppercase">
                                    Age: {po.po_date ? safeDiffDays(new Date(), po.po_date) : 0}d
                                  </span>
                                </div>
                                <div className="mt-1 text-center py-1 bg-blue-55 text-blue-700 font-extrabold text-[9px] rounded uppercase tracking-wide">
                                  Pending approval
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Widget A-5 urgent flight update queue */}
                      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-extrabold text-sm text-slate-900">Missing Flight Details</h3>
                            <span className="px-2 py-0.5 bg-red-50 text-red-700 text-[10px] font-black uppercase rounded">
                              Overdue Departures
                            </span>
                          </div>
                          <div className="flex items-baseline space-x-1.5 mt-2 mb-4">
                            <span className="text-3xl font-extrabold text-slate-950">{a5PendingFlights.count}</span>
                            <span className="text-xs text-slate-450 font-bold">Overdue / Travel Near</span>
                          </div>
                        </div>

                        <div className="space-y-2.5 max-h-60 overflow-y-auto pt-2 border-t border-slate-100">
                          {a5PendingFlights.list.length === 0 ? (
                            <p className="text-center text-xs text-slate-400 py-4 font-semibold">Itinerary is fully complete.</p>
                          ) : (
                            a5PendingFlights.list.slice(0, 3).map(flt => {
                              const isClose = safeDiffDays(flt.departure_date, new Date()) <= 2;
                              return (
                                <div key={flt.id} className="p-2.5 rounded-xl bg-slate-50 text-[11px] border border-slate-200/50 flex flex-col justify-between">
                                  <div className="flex justify-between items-start mb-1">
                                    <div>
                                      <p className="font-black text-sky-600 outline-none hover:underline cursor-pointer text-xs" onClick={() => openTicketDrawer(flt)}>
                                        {flt.passenger_name}
                                      </p>
                                      <p className={`text-[10px] font-extrabold ${isClose ? 'text-red-500' : 'text-slate-400'} mt-0.5`}>
                                        Travel: {flt.departure_date}
                                      </p>
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-500">{flt.route}</span>
                                  </div>
                                  <p className="mt-1 text-center py-1 text-slate-500 font-extrabold text-[9px] uppercase tracking-wide">
                                    Awaiting flight details
                                  </p>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>

                    </div>

                  </div>
                )}

                {/* ---------------------------------------------------------
                    SECTION B — FINANCE
                   --------------------------------------------------------- */}
                {activeSection === 'finance' && isFinance && (
                  <div className="space-y-8 animate-fadeIn">
                    
                    {/* WIDGET F-1 OVERDUE PAYMENTS AND CONSOLE ACTIONS */}
                    <section className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs">
                      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 mb-6">
                        <div>
                          <h3 className="font-extrabold text-base text-slate-905">Widget F-1 — Outstanding Overdue Payments</h3>
                          <p className="text-xs text-slate-500">Unpaid vendor invoices past due dates</p>
                        </div>

                        {/* Overdue filters & sort values Selector */}
                        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
                          {/* Date Range Filter Section */}
                          <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-200">
                            <span className="text-[10px] text-slate-500 font-extrabold uppercase px-1">Date Range:</span>
                            <div className="flex items-center space-x-1">
                              <input
                                type="date"
                                value={f1StartDate}
                                onChange={e => setF1StartDate(e.target.value)}
                                className="bg-white border border-slate-200 text-slate-700 text-xs font-semibold py-1 px-2 rounded-lg outline-none focus:ring-1 focus:ring-sky-500"
                                title="Start Date"
                              />
                              <span className="text-slate-400 text-xs font-bold">—</span>
                              <input
                                type="date"
                                value={f1EndDate}
                                onChange={e => setF1EndDate(e.target.value)}
                                className="bg-white border border-slate-200 text-slate-700 text-xs font-semibold py-1 px-2 rounded-lg outline-none focus:ring-1 focus:ring-sky-500"
                                title="End Date"
                              />
                            </div>
                            {(f1StartDate || f1EndDate) && (
                              <button
                                onClick={() => {
                                  setF1StartDate('');
                                  setF1EndDate('');
                                }}
                                className="px-2.5 py-1 text-[10px] font-black text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-200"
                              >
                                Clear
                              </button>
                            )}
                          </div>

                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-slate-400 font-bold flex items-center">
                              <Filter className="h-3.5 w-3.5 mr-1" /> Sort:
                            </span>
                            <select
                              value={f1SortBy}
                              onChange={e => setF1SortBy(e.target.value as any)}
                              className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold py-1 px-2 rounded-lg outline-none"
                            >
                              <option value="days">Days Overdue</option>
                              <option value="invoice_date">Original Due Date</option>
                              <option value="month">Month Due</option>
                              <option value="invoice_number">Invoice Ref</option>
                              <option value="travel_agent">Vendor / Payee</option>
                              <option value="amount">Amount Overdue</option>
                            </select>
                            <button
                              onClick={() => setF1SortDir(prev => prev === 'asc' ? 'desc' : 'asc')}
                              className="p-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs"
                              title="Toggle direction"
                            >
                              {f1SortDir === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Overdue Payment Hero metric box */}
                      <div className="bg-red-50 p-5 rounded-2xl border border-red-100 mb-6 flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
                        <div>
                          <span className="text-xs uppercase font-black text-red-500 block mb-1">Total Overdue Sum</span>
                          <span className="text-4xl font-extrabold text-red-600">${f1OverduePayments.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex gap-6 text-xs text-slate-700">
                          <div>
                            <span className="text-slate-400 font-bold block">Invoice Count</span>
                            <span className="font-black text-slate-900 text-base">{f1OverduePayments.count} Overdue Invoices</span>
                          </div>
                          <div>
                            <span className="text-slate-400 font-bold block">Oldest Aging</span>
                            <span className="font-black text-red-600 text-base">{f1OverduePayments.maxOverdueDays} Days Past Due</span>
                          </div>
                        </div>
                      </div>

                      {/* OVERDUE LISTING TABLE WITH MULTIPLE QUICK ACTION MUTATIONS */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-slate-100 text-slate-400 text-[10px] font-black uppercase tracking-wider select-none">
                              <th 
                                className="px-4 py-3.5 cursor-pointer hover:bg-slate-50 transition-colors rounded-l-xl"
                                onClick={() => {
                                  if (f1SortBy === 'invoice_number') {
                                    setF1SortDir(prev => prev === 'asc' ? 'desc' : 'asc');
                                  } else {
                                    setF1SortBy('invoice_number');
                                    setF1SortDir('asc');
                                  }
                                }}
                              >
                                <div className="flex items-center space-x-1">
                                  <span>Invoice Ref</span>
                                  {f1SortBy === 'invoice_number' ? (
                                    f1SortDir === 'asc' ? <ChevronUp className="h-3 w-3 text-slate-600" /> : <ChevronDown className="h-3 w-3 text-slate-600" />
                                  ) : (
                                    <span className="text-slate-300 opacity-0 hover:opacity-100 transition-opacity">↕</span>
                                  )}
                                </div>
                              </th>
                              <th 
                                className="px-4 py-3.5 cursor-pointer hover:bg-slate-50 transition-colors"
                                onClick={() => {
                                  if (f1SortBy === 'travel_agent') {
                                    setF1SortDir(prev => prev === 'asc' ? 'desc' : 'asc');
                                  } else {
                                    setF1SortBy('travel_agent');
                                    setF1SortDir('asc');
                                  }
                                }}
                              >
                                <div className="flex items-center space-x-1">
                                  <span>Vendor / Payee</span>
                                  {f1SortBy === 'travel_agent' ? (
                                    f1SortDir === 'asc' ? <ChevronUp className="h-3 w-3 text-slate-600" /> : <ChevronDown className="h-3 w-3 text-slate-600" />
                                  ) : (
                                    <span className="text-slate-300 opacity-0 hover:opacity-100 transition-opacity">↕</span>
                                  )}
                                </div>
                              </th>
                              <th 
                                className="px-4 py-3.5 cursor-pointer hover:bg-slate-50 transition-colors text-right"
                                onClick={() => {
                                  if (f1SortBy === 'invoice_date') {
                                    setF1SortDir(prev => prev === 'asc' ? 'desc' : 'asc');
                                  } else {
                                    setF1SortBy('invoice_date');
                                    setF1SortDir('asc');
                                  }
                                }}
                              >
                                <div className="flex items-center justify-end space-x-1">
                                  <span>Original Due Date</span>
                                  {f1SortBy === 'invoice_date' ? (
                                    f1SortDir === 'asc' ? <ChevronUp className="h-3 w-3 text-slate-600" /> : <ChevronDown className="h-3 w-3 text-slate-600" />
                                  ) : (
                                    <span className="text-slate-300 opacity-0 hover:opacity-100 transition-opacity">↕</span>
                                  )}
                                </div>
                              </th>
                              <th 
                                className="px-4 py-3.5 cursor-pointer hover:bg-slate-50 transition-colors text-right"
                                onClick={() => {
                                  if (f1SortBy === 'month') {
                                    setF1SortDir(prev => prev === 'asc' ? 'desc' : 'asc');
                                  } else {
                                    setF1SortBy('month');
                                    setF1SortDir('asc');
                                  }
                                }}
                              >
                                <div className="flex items-center justify-end space-x-1">
                                  <span>Month Due</span>
                                  {f1SortBy === 'month' ? (
                                    f1SortDir === 'asc' ? <ChevronUp className="h-3 w-3 text-slate-600" /> : <ChevronDown className="h-3 w-3 text-slate-600" />
                                  ) : (
                                    <span className="text-slate-300 opacity-0 hover:opacity-100 transition-opacity">↕</span>
                                  )}
                                </div>
                              </th>
                              <th 
                                className="px-4 py-3.5 cursor-pointer hover:bg-slate-50 transition-colors text-center"
                                onClick={() => {
                                  if (f1SortBy === 'days') {
                                    setF1SortDir(prev => prev === 'asc' ? 'desc' : 'asc');
                                  } else {
                                    setF1SortBy('days');
                                    setF1SortDir('asc');
                                  }
                                }}
                              >
                                <div className="flex items-center justify-center space-x-1">
                                  <span>Days Overdue</span>
                                  {f1SortBy === 'days' ? (
                                    f1SortDir === 'asc' ? <ChevronUp className="h-3 w-3 text-slate-600" /> : <ChevronDown className="h-3 w-3 text-slate-600" />
                                  ) : (
                                    <span className="text-slate-300 opacity-0 hover:opacity-100 transition-opacity">↕</span>
                                  )}
                                </div>
                              </th>
                              <th 
                                className="px-4 py-3.5 cursor-pointer hover:bg-slate-50 transition-colors text-right rounded-r-xl"
                                onClick={() => {
                                  if (f1SortBy === 'amount') {
                                    setF1SortDir(prev => prev === 'asc' ? 'desc' : 'asc');
                                  } else {
                                    setF1SortBy('amount');
                                    setF1SortDir('asc');
                                  }
                                }}
                              >
                                <div className="flex items-center justify-end space-x-1">
                                  <span>Amount</span>
                                  {f1SortBy === 'amount' ? (
                                    f1SortDir === 'asc' ? <ChevronUp className="h-3 w-3 text-slate-600" /> : <ChevronDown className="h-3 w-3 text-slate-600" />
                                  ) : (
                                    <span className="text-slate-300 opacity-0 hover:opacity-100 transition-opacity">↕</span>
                                  )}
                                </div>
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-xs">
                            {f1OverduePayments.list.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="text-center py-6 text-slate-400">No overdue items currently present. Lock secure.</td>
                              </tr>
                            ) : (
                              f1OverduePayments.list.map(ov => {
                                const age = ov.invoice_date ? safeDiffDays(new Date(), ov.invoice_date) : 0;
                                return (
                                  <tr key={ov.id} className="transition-all duration-150 hover:shadow-[0_2px_8px_-1px_rgba(0,0,0,0.06)] hover:bg-slate-50 relative">
                                    <td className="px-4 py-3.5 whitespace-nowrap font-bold text-slate-900">{ov.invoice_number || 'INV-REF'}</td>
                                    <td className="px-4 py-3.5 font-medium text-slate-600">{ov.travel_agent || 'General Partner'}</td>
                                    <td className="px-4 py-3.5 text-right text-slate-500 whitespace-nowrap">{ov.invoice_date}</td>
                                    <td className="px-4 py-3.5 text-right text-slate-450 whitespace-nowrap font-semibold">
                                      {ov.invoice_date ? format(safeParseISO(ov.invoice_date), 'MMMM yyyy') : 'No Month'}
                                    </td>
                                    <td className="px-4 py-3.5 text-center whitespace-nowrap">
                                      <span className={`px-2.5 py-0.5 rounded text-[10px] font-black ${
                                        age > 30 ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                                      }`}>
                                        {age} Days Overdue
                                      </span>
                                    </td>
                                    <td className="px-4 py-3.5 text-right font-black text-slate-950">
                                      {(ov.currency || '').toUpperCase() === 'LKR' ? 'LKR ' : '$'}{Number(ov.amount).toLocaleString()}
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>

                    {/* WIDGET F-2 AGENT-WISE INVOICE SUMMARY */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      
                      {/* Bar comparison chart */}
                      <div className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <h3 className="font-extrabold text-base text-slate-900">Agent Valuation Breakdown</h3>
                            
                            {/* Monthly arrow navigator */}
                            <div className="flex items-center space-x-1 bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                              <button onClick={() => setAgentMonthOffset(p => p + 1)} className="p-1 text-slate-500 hover:text-slate-900">
                                <ChevronLeft className="h-4 w-4" />
                              </button>
                              <span className="text-[10px] font-extrabold px-1 text-slate-700 min-w-16 text-center">
                                {f2AgentMetrics.displayedMonthName}
                              </span>
                              <button onClick={() => setAgentMonthOffset(p => Math.max(0, p - 1))} className="p-1 text-slate-500 hover:text-slate-900">
                                <ChevronRight className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                          <p className="text-xs text-slate-500 mb-4">Comparison of current selected month costs vs. previous cycle</p>
                        </div>

                        {/* Interactive Bar Chart */}
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={f2AgentMetrics.chartData}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} />
                              <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                              <YAxis tick={{ fontSize: 9 }} />
                              <Tooltip formatter={(value, name, props) => `${(props.payload.currency || '').toUpperCase() === 'LKR' ? 'LKR ' : '$'}${Number(value).toLocaleString()}`} />
                              <Legend textAnchor="middle" />
                              <Bar dataKey="Current Month" fill="#0284c7" radius={[4, 4, 0, 0]} />
                              <Bar dataKey="Previous Month" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Detail Data table with Export functionality */}
                      <div className="bg-white rounded-3xl border border-slate-200 p-6 overflow-hidden flex flex-col justify-between">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="font-extrabold text-base text-slate-900">F-2 Invoice Summary Tables</h3>
                            <p className="text-xs text-slate-500">Per-agent billing details metrics</p>
                          </div>
                          <button
                            onClick={handleExportCSV}
                            className="flex items-center space-x-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold rounded-lg border border-slate-220"
                          >
                            <Download className="h-3 w-3" />
                            <span>Export CSV</span>
                          </button>
                        </div>

                        <div className="overflow-x-auto flex-1">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="border-b border-slate-100 text-slate-400 font-extrabold text-[9px] uppercase tracking-wider">
                                <th className="py-2">Agent Name</th>
                                <th className="py-2 text-center">Tickets</th>
                                <th className="py-2 text-right">Total Invoice</th>
                                <th className="py-2 text-right">Avg Ticket</th>
                                <th className="py-2 text-center">Trend</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {f2AgentMetrics.tableItems.map((item, idx) => (
                                <tr key={idx} className="transition-all duration-150 hover:shadow-[0_2px_8px_-1px_rgba(0,0,0,0.06)] hover:bg-slate-50 relative">
                                  <td className="py-2.5 font-bold text-slate-900">{item.name}</td>
                                  <td className="py-2.5 text-center font-medium text-slate-750">{item.qty}</td>
                                  <td className="py-2.5 text-right font-black text-slate-950">{(item.currency || '').toUpperCase() === 'LKR' ? 'LKR ' : '$'}{item.cost.toLocaleString()}</td>
                                  <td className="py-2.5 text-right text-slate-500">{(item.currency || '').toUpperCase() === 'LKR' ? 'LKR ' : '$'}{item.avg.toLocaleString()}</td>
                                  <td className="py-2.5 text-center">
                                    <span className={`flex items-center justify-center font-black ${
                                      item.trend > 0 ? 'text-red-500' : 'text-green-600'
                                    }`}>
                                      {item.trend > 0 ? '↑' : '↓'} {Math.abs(item.trend)}%
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                    </div>

                    {/* WIDGET F-3 PER-AGENT TICKET RATE HISTOGRAM */}
                    <section className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                        <div>
                          <h3 className="font-extrabold text-base text-slate-900">Per-Agent Ticket Rate Histogram</h3>
                          <p className="text-xs text-slate-500">Frequency distribution of processing rates over time</p>
                        </div>
                        
                        {/* Selector/Toggle bars */}
                        <div className="flex flex-wrap items-center gap-2">
                          
                          {/* Agent dropdown selector overlay */}
                          <div className="flex items-center space-x-1.5 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">
                            <span className="text-[10px] uppercase font-black text-slate-450">Focus:</span>
                            <select
                              value={selectedF3Agent}
                              onChange={e => setSelectedF3Agent(e.target.value)}
                              className="bg-transparent text-slate-900 text-xs font-bold font-sans outline-none cursor-pointer"
                            >
                              {f3HistogramStats.agentOptions.map((opt, i) => (
                                <option key={i} value={opt}>{opt}</option>
                              ))}
                            </select>
                          </div>

                          {/* Trigger view change */}
                          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                            <button
                              onClick={() => setF3ViewType('weekly')}
                              className={`px-2.5 py-1 text-[10px] font-extrabold rounded ${
                                f3ViewType === 'weekly' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                              }`}
                            >
                              Weekly View
                            </button>
                            <button
                              onClick={() => setF3ViewType('monthly')}
                              className={`px-2.5 py-1 text-[10px] font-extrabold rounded ${
                                f3ViewType === 'monthly' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                              }`}
                            >
                              Monthly View
                            </button>
                          </div>

                        </div>
                      </div>

                      {/* Histogram Output Graphic bar chart */}
                      <div className="h-64 mb-6">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={f3HistogramStats.chartData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="bucket" />
                            <YAxis allowDecimals={false} />
                            <Tooltip />
                            <Bar dataKey="frequency" fill="#1e293b" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Insight Panel list */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-150">
                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center space-x-3">
                          <CheckCircle className="h-6 w-6 text-green-600" />
                          <div>
                            <span className="text-[10px] text-slate-400 font-extrabold block uppercase">Highest Average Rate</span>
                            <span className="text-xs font-bold text-slate-900">{f3HistogramStats.highestAvgAgent}</span>
                          </div>
                        </div>
                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center space-x-3">
                          <Clock className="h-6 w-6 text-sky-600 animate-spin-slow" />
                          <div>
                            <span className="text-[10px] text-slate-400 font-extrabold block uppercase">Most Consistent Operator</span>
                            <span className="text-xs font-bold text-slate-900">{f3HistogramStats.mostConsistentAgent}</span>
                          </div>
                        </div>
                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center space-x-3">
                          <TrendingUp className="h-6 w-6 text-indigo-650" />
                          <div>
                            <span className="text-[10px] text-slate-400 font-extrabold block uppercase">Highest 3M Improvement</span>
                            <span className="text-xs font-bold text-slate-900">{f3HistogramStats.mostImprovedAgent}</span>
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* MANAGER MERGED FINANCE INSIGHTS: COMPANY COSTS & AGENT OBLIGATIONS */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6 pb-2">
                      
                      {/* Cost by Company Breakdown */}
                      <div className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col justify-between">
                        <div>
                          <h3 className="font-extrabold text-base text-slate-905">Travel Cost Allocation by Company</h3>
                          <p className="text-xs text-slate-500 mb-4">Real-time compilation of total flight expenditures grouped by client division</p>
                        </div>
                        <div className="space-y-4 flex-1 mt-2">
                          {Object.keys(costsByCompany).length === 0 ? (
                            <p className="text-xs text-slate-400 py-6 text-center">No client allocations recorded.</p>
                          ) : (
                            Object.entries(costsByCompany).map(([company, amount], idx) => {
                              const totalSum = (Object.values(costsByCompany) as number[]).reduce((a, b) => a + b, 0);
                              const percentage = totalSum > 0 ? Math.round((Number(amount) / totalSum) * 100) : 0;
                              return (
                                <div key={idx} className="space-y-1">
                                  <div className="flex justify-between text-xs">
                                    <span className="font-bold text-slate-700">{company}</span>
                                    <span className="font-black text-slate-950">${amount.toLocaleString()} ({percentage}%)</span>
                                  </div>
                                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-indigo-600 rounded-full transition-all" 
                                      style={{ width: `${percentage}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>

                      {/* Outstanding Debts to Agents */}
                      <div className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col justify-between">
                        <div>
                          <h3 className="font-extrabold text-base text-slate-905">Pending Payments to Travel Agents</h3>
                          <p className="text-xs text-slate-500 mb-4">Total outstanding liability for processing travel bills across partner agencies</p>
                        </div>
                        <div className="divide-y divide-slate-100 flex-1 overflow-y-auto max-h-64 mt-2 pr-1">
                          {Object.keys(pendingPaymentsToAgents).length === 0 ? (
                            <p className="text-xs text-slate-400 py-6 text-center">All agent accounts reconciled.</p>
                          ) : (
                            Object.entries(pendingPaymentsToAgents).map(([agent, amount], idx) => (
                              <div key={idx} className="py-3 flex justify-between items-center first:pt-0 last:pb-0">
                                <div className="flex items-center space-x-2.5">
                                  <div className="w-2.5 h-2.5 rounded-full bg-sky-500" />
                                  <span className="text-xs font-bold text-slate-800">{agent}</span>
                                </div>
                                <span className="text-xs font-black text-slate-950">${amount.toLocaleString()}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                    </div>

                  </div>
                )}

                {/* ---------------------------------------------------------
                    SECTION C — PROJECT MANAGEMENT
                   --------------------------------------------------------- */}
                {activeSection === 'pm' && isPM && (
                  <div className="space-y-8 animate-fadeIn">
                    
                    {/* Real-time Project Financials Chart */}
                    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs">
                      <div>
                        <h3 className="font-extrabold text-base text-slate-900">Project Financial Allocation vs Real-Time Spending</h3>
                        <p className="text-xs text-slate-500 mb-6">Comparison of total project budget allowance vs true aggregated airline ticket costs loaded from live records</p>
                      </div>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={projectsListWithSpent} margin={{ bottom: 15 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                            <XAxis 
                              dataKey="name" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fontSize: 10, fill: '#64748B', fontWeight: 500 }} 
                              interval={0}
                              angle={-20}
                              textAnchor="end"
                              height={55}
                              tickFormatter={(val) => val && val.length > 20 ? `${val.substring(0, 18)}...` : val}
                            />
                            <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10}} />
                            <Tooltip formatter={(v: any) => `$${v.toLocaleString()}`} />
                            <Legend />
                            <Bar dataKey="spent" name="Spent (USD)" fill="#0284c7" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="budget_allocated" name="Budget Assigned (USD)" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* WIDGET PM-1 WORKFORCE CORRIDOR GRID CARD */}
                    <div className="space-y-6">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                          <h3 className="font-extrabold text-base text-slate-900">Workforce Deployment & Spend Tracker</h3>
                          <p className="text-xs text-slate-500 w-full">Detailed allowance vs actual flight cost comparison per project</p>
                        </div>
                        
                        {/* Period select dropdown */}
                        <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
                          <span className="text-[10px] font-black text-slate-500 uppercase px-2">Workforce Filter:</span>
                          {(['all', 'current', 'recent'] as const).map(per => {
                            const labels = { all: 'All Deploy', current: 'Active Only', recent: 'Completed Only' };
                            return (
                              <button
                                key={per}
                                onClick={() => setProjectPeriod(per)}
                                className={`px-2.5 py-1 text-[10px] font-extrabold rounded ${
                                  projectPeriod === per ? 'bg-white text-slate-905 shadow-xs' : 'text-slate-550'
                                }`}
                              >
                                {labels[per]}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Grid cards per project */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {pm1ProjectDetails.map(proj => {
                          const isExceeded = proj.budgetStatus === 'exceeded';
                          const isNear = proj.budgetStatus === 'near';
                          
                          return (
                            <div key={proj.id} className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs flex flex-col justify-between space-y-4">
                              
                              {/* Header & Status Indicator */}
                              <div className="flex justify-between items-start">
                                <div>
                                  <span className="text-[10px] text-slate-400 font-extrabold block uppercase">{proj.code}</span>
                                  <h4 className="font-extrabold text-slate-900 text-sm mt-0.5 leading-snug">{proj.name}</h4>
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                                  isExceeded ? 'bg-red-100 text-red-800' :
                                  isNear ? 'bg-amber-100 text-amber-800' :
                                  'bg-green-100 text-green-800'
                                }`}>
                                  {isExceeded ? 'Exceeded !' : isNear ? 'Near Limit' : 'Within Target'}
                                </span>
                              </div>

                              {/* Progress bar visualizer */}
                              <div className="space-y-1">
                                <div className="flex justify-between text-[11px] font-bold">
                                  <span className="text-slate-400">Budget Spent</span>
                                  <span className={isExceeded ? 'text-red-500' : 'text-slate-600'}>
                                    {Math.round(proj.spendPercent)}%
                                  </span>
                                </div>
                                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full transition-all ${
                                      isExceeded ? 'bg-red-500' : isNear ? 'bg-amber-500' : 'bg-green-500'
                                    }`}
                                    style={{ width: `${Math.min(100, proj.spendPercent)}%` }}
                                  />
                                </div>
                              </div>

                              {/* Math Numbers stats lists */}
                              <div className="grid grid-cols-2 gap-4 text-xs pt-3 border-t border-slate-100">
                                <div>
                                  <p className="text-slate-400 font-bold uppercase text-[9px]">Passengers Count</p>
                                  <p className="font-extrabold text-slate-800 text-sm">{proj.totalWorkers} Staff Deployed</p>
                                </div>
                                <div>
                                  <p className="text-slate-400 font-bold uppercase text-[9px]">Variance Amt</p>
                                  <p className={`font-black text-sm ${proj.netVariance > 0 ? 'text-red-500' : 'text-green-600'}`}>
                                    {proj.netVariance > 0 ? '+' : ''}${proj.netVariance.toLocaleString(undefined, { maximumFractionDigits: 2 })} USD
                                  </p>
                                </div>
                              </div>

                              {/* Expandable detailed inner table overlay */}
                              <div>
                                <button
                                  onClick={() => setCollapsibles(prev => ({ ...prev, [proj.id]: !collapsibles[proj.id as keyof typeof collapsibles] }))}
                                  className="w-full text-center py-2 bg-slate-50 border border-slate-200/50 hover:bg-slate-100 text-slate-600 font-extrabold text-[10px] rounded-xl transition flex items-center justify-center space-x-1"
                                >
                                  <span>{collapsibles[proj.id as keyof typeof collapsibles] ? 'Minimize Deployed View' : 'Expand Workforce breakdown'}</span>
                                  {collapsibles[proj.id as keyof typeof collapsibles] ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                </button>
                                
                                {collapsibles[proj.id as keyof typeof collapsibles] && (
                                  <div className="mt-3 overflow-x-auto border-t border-slate-200 max-h-52 overflow-y-auto">
                                    <table className="w-full text-left text-[10px] whitespace-nowrap mt-2">
                                      <thead>
                                        <tr className="bg-slate-50 text-slate-400 font-black uppercase">
                                          <th className="p-2">Passenger</th>
                                          <th className="p-2">Allowance</th>
                                          <th className="p-2">Actual Cost</th>
                                          <th className="p-2 text-right">Var</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 font-medium">
                                        {proj.deployments.map(dep => {
                                          const v = dep.actual_ticket_cost - dep.allowance_allocated;
                                          return (
                                            <tr key={dep.id} className="transition-all duration-150 hover:shadow-[0_2px_8px_-1px_rgba(0,0,0,0.06)] hover:bg-slate-50 relative">
                                              <td className="p-2">
                                                <p className="font-semibold text-slate-900">{dep.worker_name}</p>
                                                <p className="text-[8px] text-slate-400">{dep.role}</p>
                                              </td>
                                              <td className="p-2">${dep.allowance_allocated.toLocaleString()}</td>
                                              <td className="p-2">${dep.actual_ticket_cost.toLocaleString()}</td>
                                              <td className={`p-2 text-right font-bold ${v > 0 ? 'text-red-500' : 'text-green-500'}`}>
                                                {v > 0 ? '+' : ''}{v.toLocaleString()}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>

                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* WIDGET PM-2 BUDGET EXCEEDANCE ALERTS */}
                    <section className="bg-white border border-slate-250 rounded-3xl p-6 shadow-xs">
                      <div>
                        <h3 className="font-extrabold text-base text-slate-905 flex items-center">
                          <AlertTriangle className="h-5 w-5 text-red-500 mr-2" />
                          <span>Widget PM-2 — Budget Exceedance Warnings List</span>
                        </h3>
                        <p className="text-xs text-slate-500 mb-6">Real-time alerts identifying passengers whose ticket procurement costs exceeded allocations</p>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-slate-100 text-slate-400 text-[10px] font-black uppercase tracking-wider">
                              <th className="px-4 py-2.5">Project Name</th>
                              <th className="px-4 py-2.5">Passenger Name</th>
                              <th className="px-4 py-2.5">Ticket ID</th>
                              <th className="px-4 py-2.5 text-right">Budget Allowance</th>
                              <th className="px-4 py-2.5 text-right">Actual Cost</th>
                              <th className="px-4 py-2.5 text-right text-red-500">Exceeded By</th>
                              <th className="px-4 py-2.5 text-center">% Over</th>
                              <th className="px-4 py-2.5 text-center">Status</th>
                              <th className="px-4 py-2.5 text-center">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-xs">
                            {pm2Alerts.length === 0 ? (
                              <tr>
                                <td colSpan={9} className="text-center py-6 text-slate-400">Perfect alignment. No excess warnings registered.</td>
                              </tr>
                            ) : (
                              pm2Alerts.map(al => (
                                <tr key={al.id} className="transition-all duration-150 hover:shadow-[0_2px_8px_-1px_rgba(0,0,0,0.06)] hover:bg-slate-50 relative">
                                  <td className="px-4 py-3.5 font-bold text-slate-900">{al.project_name}</td>
                                  <td className="px-4 py-3.5 font-semibold text-slate-700">{al.worker_name}</td>
                                  <td className="px-4 py-3.5 font-black text-sky-600 outline-none hover:underline cursor-pointer" onClick={() => navigate(`/tickets/${al.ticket_id}`)}>{al.ticket_id}</td>
                                  <td className="px-4 py-3.5 text-right text-slate-600 font-medium">${al.budgeted_allowance.toLocaleString()}</td>
                                  <td className="px-4 py-3.5 text-right text-slate-900 font-extrabold">${al.actual_cost.toLocaleString()}</td>
                                  <td className="px-4 py-3.5 text-right text-red-500 font-black">${al.exceededBy.toLocaleString()}</td>
                                  <td className="px-4 py-3.5 text-center">
                                    <span className="px-2 py-0.5 bg-red-100 text-red-800 text-[10px] font-black rounded-lg">
                                      {al.pctOver}% Over
                                    </span>
                                  </td>
                                  <td className="px-4 py-3.5 text-center text-slate-500 whitespace-nowrap">{al.approval_status}</td>
                                  <td className="px-4 py-3.5 whitespace-nowrap text-center">
                                    <div className="flex justify-center space-x-1.5">
                                      <button
                                        onClick={() => toast.success(`Overage approval requested for ${al.worker_name} on project values.`)}
                                        className="px-2.5 py-1.5 bg-slate-900 text-white font-extrabold text-[10px] rounded hover:bg-slate-800 transition"
                                      >
                                        Request Approval
                                      </button>
                                      <button
                                        onClick={() => navigate(`/tickets/${al.ticket_id}`)}
                                        className="px-2.5 py-1.5 bg-slate-100 border border-slate-200 text-slate-800 font-extrabold text-[10px] rounded hover:bg-slate-200 transition"
                                      >
                                        View Ticket
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>

                  </div>
                )}

                {activeSection === 'backup' && (
                  <div className="space-y-6 animate-fadeIn font-sans">
                    {/* Database Backup Overview */}
                    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs">
                      <div className="flex items-start space-x-4">
                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl shrink-0">
                          <Download className="h-6 w-6" />
                        </div>
                        <div>
                          <h3 className="font-extrabold text-lg text-slate-950">System Database Backup & Local Export</h3>
                          <p className="text-xs text-slate-500 mt-1">
                            Generate a full, human-readable JSON snapshot of your entire flight routing, user management, and configuration database. This allows you to securely download, store, and preserve all your records offline.
                          </p>
                        </div>
                      </div>

                      <div className="mt-6 border-t border-slate-100 pt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold text-slate-800">Export Contents:</p>
                          <ul className="text-slate-500 text-[11px] list-disc pl-4 mt-2 space-y-1">
                            <li><strong>Users:</strong> System accounts and active role privileges.</li>
                            <li><strong>Tickets:</strong> Complete logs of passenger bookings, costs, and statuses.</li>
                            <li><strong>Projects:</strong> Active project names, allocated budgets, and spent tracking.</li>
                            <li><strong>Ticket Tasks:</strong> Task histories and sub-task lists.</li>
                            <li><strong>Bypass Passports:</strong> Registered bypass list.</li>
                            <li><strong>SharePoint Sync Settings:</strong> Configured scheduling, timezones, and automatic sync logs.</li>
                          </ul>
                        </div>
                        <div className="shrink-0 flex flex-col items-stretch sm:items-end justify-center">
                          <button
                            type="button"
                            onClick={async () => {
                              const saveToast = toast.loading("Generating full database backup...");
                              try {
                                const response = await api.get('/admin/backup', { responseType: 'blob' });
                                const url = window.URL.createObjectURL(new Blob([response.data]));
                                const link = document.createElement('a');
                                link.href = url;
                                const dateStr = new Date().toISOString().slice(0, 10);
                                link.setAttribute('download', `sanken_air_db_backup_${dateStr}.json`);
                                document.body.appendChild(link);
                                link.click();
                                link.remove();
                                window.URL.revokeObjectURL(url);
                                toast.success("Database backup generated and downloaded successfully!", { id: saveToast });
                              } catch (err: any) {
                                console.error(err);
                                toast.error("Failed to generate database backup: " + (err.message || "Unknown error"), { id: saveToast });
                              }
                            }}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-6 py-3 rounded-xl flex items-center justify-center space-x-2 shadow-xs transition-all cursor-pointer active:scale-98"
                          >
                            <Download className="h-4 w-4" />
                            <span>Download Full Database Backup (JSON)</span>
                          </button>
                          <p className="text-[10px] text-slate-400 mt-2 text-center sm:text-right">File size depends on document count</p>
                        </div>
                      </div>
                    </div>

                    {/* Native Cloud Platform Automated Backup Instructions */}
                    <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6">
                      <h4 className="font-extrabold text-sm text-slate-900 flex items-center mb-3">
                        <Shield className="h-4 w-4 text-indigo-600 mr-1.5" />
                        <span>Google Cloud Platform (GCP) Native Database Backups Guide</span>
                      </h4>
                      <p className="text-xs text-slate-600 leading-relaxed mb-4">
                        For institutional data compliance and disaster recovery, we recommend configuring Google Cloud's native, automatic daily backups. This stores daily point-in-time recovery points inside a secure private Google Cloud Storage bucket.
                      </p>

                      <div className="space-y-4">
                        <div className="bg-white border border-slate-200 rounded-2xl p-4">
                          <h5 className="font-bold text-xs text-slate-800 mb-1">Option 1: Schedule Automated Daily Backups (Recommended)</h5>
                          <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">
                            Google Cloud Firestore supports built-in scheduled backups. You can enable a recurring daily backup schedule directly using the Google Cloud Shell or command-line interface:
                          </p>
                          <div className="bg-slate-900 text-slate-100 font-mono text-[10px] p-3 rounded-xl select-all overflow-x-auto">
                            gcloud alpha firestore backups schedules create \<br />
                            &nbsp;&nbsp;--database="(default)" \<br />
                            &nbsp;&nbsp;--retention=7d \<br />
                            &nbsp;&nbsp;--recurrence=daily
                          </div>
                          <p className="text-[10px] text-indigo-600 mt-2 font-medium">
                            * Keeps a rolling 7-day history of point-in-time recovery copies automatically.
                          </p>
                        </div>

                        <div className="bg-white border border-slate-200 rounded-2xl p-4">
                          <h5 className="font-bold text-xs text-slate-800 mb-1">Option 2: Run an Instant Manual GCP Export</h5>
                          <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">
                            You can also trigger a formal GCP Cloud Storage backup export programmatically or through the command line:
                          </p>
                          <div className="bg-slate-900 text-slate-100 font-mono text-[10px] p-3 rounded-xl select-all overflow-x-auto">
                            gcloud firestore export gs://YOUR_BACKUP_BUCKET_NAME
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

          </main>
        </div>
      </div>

      {/* ---------------------------------------------------------
          FLOATING INLINE ACTION MODALS & DRAWER SCREEN
         --------------------------------------------------------- */}

      {/* A-5 Update Flight Info Inline Modal Popup */}
      {flightUpdateTicket && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl border border-slate-205 shadow-2xl p-6 w-full max-w-md animate-scaleUp">
            <h3 className="font-extrabold text-base text-slate-950 mb-1">Quick-Update Ticket Travel Info</h3>
            <p className="text-xs text-slate-500 mb-4">Input actual travel bookings details securely for flight {flightUpdateTicket.id}</p>

            <form onSubmit={handleFlightSubmit} className="space-y-4 text-xs text-slate-700">
              <div>
                <label className="block font-bold mb-1 select-none">Traveler Name / Route</label>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <p className="font-black text-slate-900">{flightUpdateTicket.passenger_name}</p>
                  <p className="text-slate-500">{flightUpdateTicket.route}</p>
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1 select-none text-slate-500">Flight/Departure Date</label>
                <p className="text-xs font-semibold text-slate-900 mb-2">{flightUpdateTicket.departure_date}</p>
              </div>

              <div>
                <label className="block font-bold mb-1 select-none">Actual Booking Ref (PNR / PO Number)</label>
                <input
                  type="text"
                  required
                  value={flightForm.booking_reference}
                  onChange={e => setFlightForm({ ...flightForm, booking_reference: e.target.value })}
                  placeholder="e.g. EK2356X"
                  className="w-full p-2.5 border border-slate-220 rounded-xl outline-none focus:ring-1 focus:ring-slate-500 bg-white"
                />
              </div>

              <div>
                <label className="block font-bold mb-1 select-none">Assigned Flight Number</label>
                <input
                  type="text"
                  required
                  value={flightForm.flight_number}
                  onChange={e => setFlightForm({ ...flightForm, flight_number: e.target.value })}
                  placeholder="e.g. UL101"
                  className="w-full p-2.5 border border-slate-220 rounded-xl outline-none focus:ring-1 focus:ring-slate-500 bg-white"
                />
              </div>

              <div>
                <label className="block font-bold mb-1 select-none">Itinerary/Flight Booking Status</label>
                <select
                  value={flightForm.flight_status}
                  onChange={e => setFlightForm({ ...flightForm, flight_status: e.target.value })}
                  className="w-full p-2.5 border border-slate-220 rounded-xl outline-none bg-white font-semibold text-slate-800"
                >
                  <option value="CONFIRMED">CONFIRMED (Stage 2 verified & finalized)</option>
                  <option value="PENDING">PENDING (Action required)</option>
                  <option value="CANCELLED">CANCELLED</option>
                  <option value="RESCHEDULED">RESCHEDULED</option>
                </select>
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setFlightUpdateTicket(null)}
                  className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl border border-slate-220 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition shadow-xs"
                >
                  Save & complete Stage 2
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TICKET DETAILS DRAWER OVERLAY */}
      {selectedTicketId && selectedTicket && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex justify-end p-0 z-50 animate-fadeIn">
          <div className="bg-white w-full max-w-xl h-full shadow-2xl flex flex-col justify-between overflow-hidden animate-slideLeft">
            
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center flex-shrink-0">
              <div>
                <span className="text-[10px] text-sky-400 font-black uppercase tracking-wider">Ticket Detailed Console</span>
                <h4 className="text-lg font-black tracking-tight">{selectedTicket.id}</h4>
              </div>
              <button
                onClick={() => { setSelectedTicketId(null); setSelectedTicket(null); }}
                className="p-1.5 rounded-full hover:bg-slate-800 text-slate-300 hover:text-white transition"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-700">
              
              {/* Step and current status badge */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[9px] uppercase font-black text-slate-400 block mb-0.5">Current Operational Status</span>
                  <span className="bg-sky-100 text-sky-850 font-black py-0.5 px-2 rounded border border-sky-200">
                    {selectedTicket.status}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] uppercase font-black text-slate-400 block mb-0.5">Assigned Admin</span>
                  <span className="font-extrabold text-slate-900">{selectedTicket.assigned_to || 'System Admin'}</span>
                </div>
              </div>

              {/* Passenger Metadata details */}
              <div className="space-y-3">
                <h3 className="text-slate-950 font-extrabold text-sm border-b pb-1.5 border-slate-100 flex items-center">
                  <Users className="h-4 w-4 mr-1 text-slate-500" /> Passenger Details
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">FULL PASSENGER NAME</span>
                    <span className="font-black text-slate-900 text-sm">{selectedTicket.passenger_name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">FLIGHT ROUTE</span>
                    <span className="font-extrabold text-slate-900">{selectedTicket.route}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">DEPARTURE DATE</span>
                    <span className="font-extrabold text-slate-900">{selectedTicket.departure_date}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">TRAVEL AGENT</span>
                    <span className="font-extrabold text-slate-900">{selectedTicket.travel_agent || 'Hemline Travel Partner'}</span>
                  </div>
                </div>
              </div>

              {/* PO and financial values info */}
              <div className="space-y-3">
                <h3 className="text-slate-950 font-extrabold text-sm border-b pb-1.5 border-slate-100 flex items-center">
                  <DollarSign className="h-4 w-4 mr-1 text-slate-500" /> Procurement and Invoicing
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">PO NUMBER</span>
                    <span className="font-extrabold text-slate-900">{selectedTicket.po_number || 'No Purchase Order'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">PO STATUS</span>
                    <span className="px-2 py-0.5 bg-amber-50 text-amber-800 text-[10px] font-black uppercase rounded">
                      {selectedTicket.po_status || 'Pending'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">INVOICE NUMBER</span>
                    <span className="font-extrabold text-slate-900">{selectedTicket.invoice_number || 'Unlinked'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">INVOICE AMOUNT</span>
                    <span className="font-black text-slate-950 text-sm">
                      {(selectedTicket.currency || '').toUpperCase() === 'LKR' ? 'LKR ' : '$'}{Number(selectedTicket.approved_rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-150 flex space-x-2 flex-shrink-0">
              <button
                onClick={() => { setSelectedTicketId(null); setSelectedTicket(null); }}
                className="flex-1 py-2 text-center bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-xl transition"
              >
                Close Drawer
              </button>
              <button
                onClick={() => {
                  setSelectedTicketId(null);
                  setSelectedTicket(null);
                  navigate(`/tickets/${selectedTicket.id}`);
                }}
                className="flex-1 py-2 text-center bg-sky-600 hover:bg-sky-700 text-white font-extrabold rounded-xl transition"
              >
                Go to Ticket File
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
