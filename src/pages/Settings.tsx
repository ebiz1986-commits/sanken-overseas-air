import React, { useState, useEffect } from 'react';
import { useAuthStore, useThemeStore } from '../store';
import api from '../api';
import toast from 'react-hot-toast';
import { Plus, Trash2, ArrowLeft, Users, ListFilter, LogOut, Briefcase, ShieldCheck, AlertCircle, X, Edit2, History, Download, Moon, Sun, Cloud, RefreshCw, ExternalLink } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useFormValidation } from '../hooks/useFormValidation';
import FieldError from '../components/FieldError';

const getTodayStr = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export default function Settings() {
  const { role, user: currentUser, logout } = useAuthStore();
  const { isDarkMode, toggleDarkMode } = useThemeStore();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'dropdowns' | 'users' | 'projects' | 'bypass_passports' | 'entitlement_logs' | 'sharepoint'>(
    (localStorage.getItem('settingsActiveTab') as any) || 'dropdowns'
  );
  
  const { errors, handleBlur, handleChange: handleValidationChange, validateForm } = useFormValidation();
  
  const [isAdminAuthModalOpen, setIsAdminAuthModalOpen] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [pendingUserAction, setPendingUserAction] = useState<{ type: 'delete' | 'create', payload: any } | null>(null);
  const [isAuthorizing, setIsAuthorizing] = useState(false);

  useEffect(() => {
    localStorage.setItem('settingsActiveTab', activeTab);
  }, [activeTab]);
  
  const [options, setOptions] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [bypassPassports, setBypassPassports] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [newOption, setNewOption] = useState({ category: 'TICKET_TYPE', value: '' });
  const [newUser, setNewUser] = useState({ email: '', full_name: '', password: '', role: 'ADMIN1' });
  const [newProject, setNewProject] = useState({ name: '', company: '', country: '', budget_allocated: '', entitlement_total: '' });
  const [newBypass, setNewBypass] = useState({ pp_number: '', name: '' });
  const [adding, setAdding] = useState(false);
  
  // SharePoint Integration States & Actions
  const [sharepointConfig, setSharepointConfig] = useState<any>({
    enabled: false,
    tenantId: "",
    clientId: "",
    clientSecret: "",
    siteUrl: "",
    folderPath: "Shared Documents/Air Tickets",
    timezoneOffset: 5.5,
    uploadDay: 5,
    uploadHour: 17
  });
  const [sharepointLogs, setSharepointLogs] = useState<any[]>([]);
  const [sharepointLoading, setSharepointLoading] = useState(false);
  const [sharepointSaving, setSharepointSaving] = useState(false);
  const [sharepointSyncing, setSharepointSyncing] = useState(false);

  const [cloudSubTab, setCloudSubTab] = useState<'sharepoint' | 'gdrive'>('sharepoint');

  // Google Drive Integration States & Actions
  const [gdriveConfig, setGdriveConfig] = useState<any>({
    enabled: false,
    folderName: "Air Tickets Backup",
    timezoneOffset: 5.5,
    uploadDay: 5,
    uploadHour: 17,
    accessToken: "",
    linkedEmail: ""
  });
  const [gdriveLogs, setGdriveLogs] = useState<any[]>([]);
  const [gdriveLoading, setGdriveLoading] = useState(false);
  const [gdriveSaving, setGdriveSaving] = useState(false);
  const [gdriveSyncing, setGdriveSyncing] = useState(false);

  // Disaster Recovery Database Backup States
  const [gdriveBackupLogs, setGdriveBackupLogs] = useState<any[]>([]);
  const [gdriveBackupSyncing, setGdriveBackupSyncing] = useState(false);

  const fetchSharepointData = async () => {
    setSharepointLoading(true);
    setGdriveLoading(true);
    try {
      const [configRes, logsRes, gdConfigRes, gdLogsRes, gdBackupLogsRes] = await Promise.all([
        api.get('/sharepoint/config').catch(() => null),
        api.get('/sharepoint/logs').catch(() => null),
        api.get('/gdrive/config').catch(() => null),
        api.get('/gdrive/logs').catch(() => null),
        api.get('/gdrive/backup-logs').catch(() => null)
      ]);
      if (configRes?.data) {
        setSharepointConfig(configRes.data);
      }
      if (logsRes?.data?.logs) {
        setSharepointLogs(logsRes.data.logs);
      }
      if (gdConfigRes?.data) {
        setGdriveConfig(gdConfigRes.data);
      }
      if (gdLogsRes?.data?.logs) {
        setGdriveLogs(gdLogsRes.data.logs);
      }
      if (gdBackupLogsRes?.data?.logs) {
        setGdriveBackupLogs(gdBackupLogsRes.data.logs);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to load Cloud Exporter settings');
    } finally {
      setSharepointLoading(false);
      setGdriveLoading(false);
    }
  };

  const handleGoogleDriveLink = async () => {
    const { auth } = await import('../lib/firebase');
    const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
    
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    provider.addScope('https://www.googleapis.com/auth/drive');
    
    const toastId = toast.loading('Opening Google Sign-In popup...');
    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) {
        throw new Error('Failed to retrieve Google Access Token.');
      }
      
      const token = credential.accessToken;
      const email = result.user.email || '';
      
      const updatedConfig = {
        ...gdriveConfig,
        accessToken: token,
        linkedEmail: email,
        enabled: true,
        accessTokenExpired: false,
        lastError: ""
      };
      setGdriveConfig(updatedConfig);
      
      await api.post('/gdrive/config', updatedConfig);
      toast.success(`Google Drive account linked: ${email}`, { id: toastId });
      fetchSharepointData();
    } catch (err: any) {
      console.error('Google link error:', err);
      toast.error(err.message || 'Failed to authenticate with Google', { id: toastId });
    }
  };

  const handleSaveGdriveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setGdriveSaving(true);
    try {
      await api.post('/gdrive/config', gdriveConfig);
      toast.success('Google Drive configuration saved successfully');
      fetchSharepointData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to save Google Drive configuration');
    } finally {
      setGdriveSaving(false);
    }
  };

  const handleManualGdriveSync = async () => {
    setGdriveSyncing(true);
    const toastId = toast.loading('Initiating manual Google Drive synchronization and upload...');
    try {
      await api.post('/gdrive/test');
      toast.success('Report uploaded to Google Drive successfully!', { id: toastId });
      fetchSharepointData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Google Drive upload failed. Check authorization.', { id: toastId });
    } finally {
      setGdriveSyncing(false);
    }
  };

  const handleManualGdriveBackup = async () => {
    if (!gdriveConfig.accessToken) {
      toast.error("Google Drive is not linked. Please link your Google account first.");
      return;
    }
    const confirmed = window.confirm(
      "Are you sure you want to trigger a manual database backup? This will generate a full JSON export of all Firestore collections and upload it to the connected Google Drive folder."
    );
    if (!confirmed) return;

    setGdriveBackupSyncing(true);
    const toastId = toast.loading('Exporting Firestore collections and saving backup JSON to Google Drive...');
    try {
      await api.post('/gdrive/backup');
      toast.success('Database backup completed and saved to Google Drive successfully!', { id: toastId });
      fetchSharepointData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Manual database backup to Google Drive failed. Check authorization.', { id: toastId });
    } finally {
      setGdriveBackupSyncing(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'sharepoint') {
      fetchSharepointData();
    }
  }, [activeTab]);

  const handleSaveSharepointConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSharepointSaving(true);
    try {
      await api.post('/sharepoint/config', sharepointConfig);
      toast.success('SharePoint configuration saved successfully');
      fetchSharepointData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to save SharePoint configuration');
    } finally {
      setSharepointSaving(false);
    }
  };

  const handleManualSharepointSync = async () => {
    setSharepointSyncing(true);
    const toastId = toast.loading('Initiating manual SharePoint synchronization and upload...');
    try {
      await api.post('/sharepoint/test');
      toast.success('Excel report uploaded to SharePoint successfully!', { id: toastId });
      fetchSharepointData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'SharePoint upload failed. Check credentials and path.', { id: toastId });
    } finally {
      setSharepointSyncing(false);
    }
  };
  
  const [editingOption, setEditingOption] = useState<{id: string, value: string} | null>(null);

  // Inline editing for projects list
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectData, setEditingProjectData] = useState<any | null>(null);

  const [selectedEntitlementProjId, setSelectedEntitlementProjId] = useState('');
  const [companyEntitlementInputs, setCompanyEntitlementInputs] = useState<Record<string, string>>({});
  const [companyEntitlementCycles, setCompanyEntitlementCycles] = useState<Record<string, 'MONTHLY' | 'PROJECT_PERIOD'>>({});
  const [companyEntitlementPeriods, setCompanyEntitlementPeriods] = useState<Record<string, string>>({});
  const [companyEntitlementStarts, setCompanyEntitlementStarts] = useState<Record<string, string>>({});
  const [isSavingEntitlements, setIsSavingEntitlements] = useState(false);
  const [entitlementLogSearch, setEntitlementLogSearch] = useState('');

  const entitlementTickets = React.useMemo(() => {
    const list = tickets
      .filter((t: any) => !!t.subcontractor_entitlement_applied)
      .map((t: any) => {
        const authorizerId = t.updated_by_user_id || t.created_by_user_id;
        const authorizer = users.find((u: any) => u.id === authorizerId);
        const proj = projects.find((p: any) => p.id === t.project_id || (Array.isArray(t.project_ids) && t.project_ids.includes(p.id)));

        let cycleText = 'Project Period';
        let cycleType: 'MONTHLY' | 'PROJECT_PERIOD' = 'PROJECT_PERIOD';
        if (proj && t.company) {
          const cycles = proj.company_entitlement_cycles || {};
          cycleType = cycles[t.company] || 'PROJECT_PERIOD';
          cycleText = cycleType === 'MONTHLY' ? 'Monthly' : 'Project Period';
        }

        const dateStr = t.ticket_arranged_date || t.created_at || t.departure_date;
        let formattedDate = 'N/A';
        let rawTime = 0;
        if (dateStr) {
          try {
            const d = new Date(dateStr);
            if (!isNaN(d.getTime())) {
              formattedDate = d.toLocaleString();
              rawTime = d.getTime();
            }
          } catch {}
        }

        return {
          id: t.id,
          passengerName: t.passenger_name || 'Generic / Placeholder',
          ppNumber: t.pp_number || 'N/A',
          projectName: proj ? proj.name : (t.project_id || 'Unknown Project'),
          company: t.company || 'N/A',
          authorizerName: authorizer ? authorizer.full_name : 'Admin',
          authorizerEmail: authorizer ? authorizer.email : 'system@sanken.com',
          authorizerRole: authorizer ? authorizer.role : 'ADMIN',
          rawTime,
          formattedDate,
          cycleText,
          cycleType
        };
      })
      .sort((a, b) => b.rawTime - a.rawTime);

    if (!entitlementLogSearch.trim()) return list;
    const query = entitlementLogSearch.toLowerCase().trim();
    return list.filter(item => 
      item.passengerName.toLowerCase().includes(query) ||
      item.ppNumber.toLowerCase().includes(query) ||
      item.projectName.toLowerCase().includes(query) ||
      item.company.toLowerCase().includes(query) ||
      item.authorizerName.toLowerCase().includes(query) ||
      item.authorizerEmail.toLowerCase().includes(query)
    );
  }, [tickets, users, projects, entitlementLogSearch]);

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

    projects.forEach((proj: any) => {
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

        const appliedCount = tickets.filter((t: any) => {
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

    return list;
  }, [projects, tickets]);

  const handleDownloadEntitlementsReport = () => {
    const headers = [
      'Project Name',
      'Re; company',
      'Cycle Type',
      'Period Duration (Months)',
      'Start Date',
      'Initial Entitlements Limit',
      'Applied Entitlements Count',
      'Remaining Allowance',
      'Status',
      'Exceeded Count',
      'Expiration Warning/Status'
    ];

    const rows = [headers.join(',')];

    subcontractorEntitlementsData.forEach(item => {
      const isExceeded = item.applied > item.initial;
      const exceededCount = isExceeded ? (item.applied - item.initial) : 0;
      const remainingVal = item.remaining;
      
      const statusText = remainingVal < 0 
        ? 'Exceeded' 
        : remainingVal === 0 
          ? 'Fully Availed' 
          : 'Under Limit';

      const cycleText = item.cycle === 'MONTHLY' ? 'Monthly' : 'Project Period';
      const row = [
        item.projectName || '',
        item.company || '',
        cycleText,
        item.cycle === 'PROJECT_PERIOD' ? item.duration : 'N/A',
        item.cycle === 'PROJECT_PERIOD' ? (item.startDate || 'N/A') : 'N/A',
        item.initial,
        item.applied,
        remainingVal,
        statusText,
        exceededCount,
        item.cycle === 'PROJECT_PERIOD' ? (item.expirationWarningStr || 'Active') : 'N/A'
      ];

      const csvRow = row.map(cell => {
         const cellStr = String(cell);
         if (cellStr.includes(',') || cellStr.includes('\"') || cellStr.includes('\n')) {
            return `"${cellStr.replace(/"/g, '""')}"`;
         }
         return cellStr;
      }).join(',');

      rows.push(csvRow);
    });

    const csvContent = "\uFEFF" + rows.join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Subcontractor_Ticket_Entitlements_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportEntitlementLogs = () => {
    const headers = [
      'Date_Time',
      'Passenger Name',
      'Passport Number',
      'Project',
      'Re_ Company',
      'Cycle Type',
      'Authorized By',
      'Role',
      'Email'
    ];

    const rows = [headers.join(',')];

    entitlementTickets.forEach(item => {
      const row = [
        item.formattedDate,
        item.passengerName,
        item.ppNumber,
        item.projectName,
        item.company,
        item.cycleText,
        item.authorizerName,
        item.authorizerRole,
        item.authorizerEmail
      ];

      const csvRow = row.map(cell => {
        const val = String(cell || '').replace(/"/g, '""');
        return `"${val}"`;
      }).join(',');

      rows.push(csvRow);
    });

    const csvContent = rows.join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `entitlement_logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleUpdateProject = async (id: string) => {
    if (!editingProjectData || !editingProjectData.name?.trim()) return;
    try {
      await api.put(`/projects/${id}`, {
        ...editingProjectData,
        budget_allocated: parseFloat(editingProjectData.budget_allocated) || 0,
        entitlement_total: parseInt(editingProjectData.entitlement_total) || 0
      });
      toast.success('Project updated successfully');
      setEditingProjectId(null);
      setEditingProjectData(null);
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to update project');
    }
  };

  const handleSaveCompanyEntitlements = async () => {
    if (!selectedEntitlementProjId) return;
    const proj = projects.find(p => p.id === selectedEntitlementProjId);
    if (!proj) return;

    setIsSavingEntitlements(true);
    try {
      const companyEntitlements: Record<string, number> = {};
      const companyEntitlementCyclesMap: Record<string, 'MONTHLY' | 'PROJECT_PERIOD'> = {};
      const companyEntitlementPeriodsMap: Record<string, number> = {};
      const companyEntitlementStartsMap: Record<string, string> = {};

      Object.keys(companyEntitlementInputs).forEach(comp => {
        const val = parseInt(companyEntitlementInputs[comp]);
        companyEntitlements[comp] = isNaN(val) ? 0 : val;
        
        companyEntitlementCyclesMap[comp] = companyEntitlementCycles[comp] || 'PROJECT_PERIOD';
        
        const periodVal = parseInt(companyEntitlementPeriods[comp]);
        companyEntitlementPeriodsMap[comp] = isNaN(periodVal) ? 12 : periodVal;
        
        companyEntitlementStartsMap[comp] = companyEntitlementStarts[comp] || getTodayStr();
      });

      await api.put(`/projects/${selectedEntitlementProjId}`, {
        ...proj,
        company_entitlements: companyEntitlements,
        company_entitlement_cycles: companyEntitlementCyclesMap,
        company_entitlement_periods: companyEntitlementPeriodsMap,
        company_entitlement_starts: companyEntitlementStartsMap
      });

      toast.success('Company-specific entitlements updated successfully');
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to update company-specific entitlements');
    } finally {
      setIsSavingEntitlements(false);
    }
  };

  const handleUpdateOption = async (e: React.FormEvent, id: string) => {
    e.preventDefault();
    if (!editingOption || !editingOption.value.trim()) return;
    try {
      await api.put(`/options/${id}`, { value: editingOption.value });
      toast.success('Option updated');
      setEditingOption(null);
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to update option');
    }
  };

  const categories = [
    { id: 'TICKET_TYPE', label: 'Ticket Type' },
    { id: 'TRAVEL_AGENT', label: 'Travel Agent' },
    { id: 'ROUTE', label: 'Route' },
    { id: 'COMPANY', label: 'Re; company' },
    { id: 'CURRENCY', label: 'Currency' },
    { id: 'JOB_CATEGORY', label: 'Job Category as per visa' }
  ];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [optRes, usrRes, projRes, bypassRes, tktRes] = await Promise.all([
        api.get('/options'),
        api.get('/users'),
        api.get('/projects'),
        api.get('/bypass-passports'),
        api.get('/tickets?limit=1000')
      ]);
      setOptions(Array.isArray(optRes?.data) ? optRes.data : []);
      setUsers(Array.isArray(usrRes?.data) ? usrRes.data : []);
      setProjects(Array.isArray(projRes?.data) ? projRes.data : []);
      setBypassPassports(Array.isArray(bypassRes?.data) ? bypassRes.data : []);
      setTickets(Array.isArray(tktRes?.data?.tickets) ? tktRes.data.tickets : []);
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleAddBypass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBypass.pp_number.trim() || !newBypass.name.trim()) {
      toast.error('Passport Number and Name are required');
      return;
    }
    setAdding(true);
    try {
      await api.post('/bypass-passports', {
        pp_number: newBypass.pp_number.trim().toUpperCase(),
        name: newBypass.name.trim()
      });
      toast.success('Passport added to bypass list');
      setNewBypass({ pp_number: '', name: '' });
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to add passport');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteBypass = async (id: string) => {
    if (role !== 'ADMIN') {
      toast.error('Only Admin can remove passports from the bypass list');
      return;
    }
    if (!window.confirm('Are you sure you want to remove this passport from the bypass list?')) return;
    try {
      await api.delete(`/bypass-passports/${id}`);
      toast.success('Passport removed from bypass list');
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to remove passport');
    }
  };

  const handleAddOption = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm(e.target as HTMLFormElement)) return;
    if (!newOption.value.trim()) return;
    setAdding(true);
    try {
      await api.post('/options', newOption);
      toast.success('Added successfully');
      setNewOption({ ...newOption, value: '' });
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to add option');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteOption = async (id: string) => {
    if (role !== 'ADMIN') {
      toast.error('Only Admin can delete options');
      return;
    }
    if (!window.confirm('Are you sure you want to delete this option?')) return;
    try {
      await api.delete(`/options/${id}`);
      toast.success('Deleted successfully');
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to delete option');
    }
  };

  const handleResetData = async () => {
    if (role !== 'ADMIN') {
      toast.error('Only Admin can reset data');
      return;
    }
    if (!window.confirm('Are you absolutely sure you want to clear all testing data? This cannot be undone.')) return;
    try {
      await api.delete('/admin/reset-data');
      toast.success('Database cleared successfully. Please reload/refresh the page.');
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to clear database.');
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm(e.target as HTMLFormElement)) return;
    if (!newUser.email || !newUser.password || !newUser.full_name) return;

    if (role === 'ADMIN1') {
      setAdminEmail('');
      setAdminPassword('');
      setPendingUserAction({ type: 'create', payload: newUser });
      setIsAdminAuthModalOpen(true);
      return;
    }

    setAdding(true);
    try {
      await api.post('/users', newUser);
      toast.success('User added successfully');
      setNewUser({ email: '', full_name: '', password: '', role: 'ADMIN1' });
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to add user');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (role !== 'ADMIN') {
      toast.error("Only Admin can delete/deactivate users");
      return;
    }
    if (id === currentUser?.id) {
      toast.error("You cannot delete your own account");
      return;
    }
    if (!window.confirm('Are you sure you want to deactivate this user?')) return;

    try {
      await api.delete(`/users/${id}`);
      toast.success('User deactivated');
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to delete user');
    }
  };

  const handleAdminAuthorizedAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminEmail.trim() || !adminPassword.trim()) {
      toast.error("Both Admin Email and Password are required");
      return;
    }
    if (!pendingUserAction) return;

    setIsAuthorizing(true);
    try {
      const headers = {
        'x-admin-email': encodeURIComponent(adminEmail.trim()),
        'x-admin-password': encodeURIComponent(adminPassword.trim())
      };

      if (pendingUserAction.type === 'delete') {
        const id = pendingUserAction.payload;
        await api.delete(`/users/${id}`, { headers });
        toast.success("User deactivated successfully with Admin authorization.");
      } else if (pendingUserAction.type === 'create') {
        const userData = pendingUserAction.payload;
        await api.post('/users', userData, { headers });
        toast.success("User added successfully with Admin authorization.");
        setNewUser({ email: '', full_name: '', password: '', role: 'ADMIN1' });
      }

      setIsAdminAuthModalOpen(false);
      setPendingUserAction(null);
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Authorization failed. Unable to perform user action.');
    } finally {
      setIsAuthorizing(false);
    }
  };

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm(e.target as HTMLFormElement)) return;
    if (!newProject.name.trim()) return;
    setAdding(true);
    try {
      await api.post('/projects', {
        ...newProject,
        budget_allocated: newProject.budget_allocated ? parseFloat(newProject.budget_allocated) : 0,
        entitlement_total: newProject.entitlement_total ? parseInt(newProject.entitlement_total) : 0
      });
      toast.success('Project added successfully');
      setNewProject({ name: '', company: '', country: '', budget_allocated: '', entitlement_total: '' });
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to add project');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (role !== 'ADMIN') {
      toast.error('Only Admin can delete projects');
      return;
    }
    if (!window.confirm('Are you sure you want to delete this project?')) return;
    try {
      await api.delete(`/projects/${id}`);
      toast.success('Project deleted');
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to delete project');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) {
      toast.error('New password and confirmation do not match.');
      return;
    }
    if (pwForm.next.length < 8) {
      toast.error('New password must be at least 8 characters.');
      return;
    }
    setPwSaving(true);
    try {
      await api.post('/auth/change-password', { current_password: pwForm.current, new_password: pwForm.next });
      toast.success('Password changed successfully.');
      setPwForm({ current: '', next: '', confirm: '' });
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to change password.');
    } finally {
      setPwSaving(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-50 px-4 sm:px-6 lg:px-8 py-8 max-w-7xl mx-auto">
      <div className="h-8 w-32 bg-slate-200 rounded mb-8 animate-pulse" />
      <div className="flex gap-4 mb-8 border-b border-slate-200 pb-2">
        <div className="h-10 w-24 bg-slate-200 rounded animate-pulse" />
        <div className="h-10 w-32 bg-slate-200 rounded animate-pulse" />
        <div className="h-10 w-24 bg-slate-200 rounded animate-pulse" />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 h-96 animate-pulse" />
    </div>
  );

  // Non-admins see only the My Account tab
  if (role !== 'ADMIN' && role !== 'ADMIN1') {
    return (
      <div className="min-h-screen bg-slate-50 pb-12">
        <div className="max-w-2xl mx-auto p-6 mt-4">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-slate-800">My Account</h1>
            <button
              onClick={toggleDarkMode}
              className="flex items-center space-x-2 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors font-medium border border-slate-300"
            >
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              <span>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-4">Change Password</h2>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Current Password</label>
                <input type="password" required value={pwForm.current} onChange={e => setPwForm({...pwForm, current: e.target.value})} className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-sky-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">New Password (8+ chars)</label>
                <input type="password" required minLength={8} value={pwForm.next} onChange={e => setPwForm({...pwForm, next: e.target.value})} className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-sky-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Confirm New Password</label>
                <input type="password" required value={pwForm.confirm} onChange={e => setPwForm({...pwForm, confirm: e.target.value})} className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-sky-500" />
              </div>
              <button type="submit" disabled={pwSaving} className="w-full px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-lg disabled:opacity-50">
                {pwSaving ? 'Saving...' : 'Change Password'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <div className="max-w-5xl mx-auto p-6 mt-4">
        
        <div className="flex items-center mb-6 justify-between">
          <div className="flex items-center">
            <Link to="/dashboard" className="text-slate-500 hover:text-slate-800 mr-4 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500 rounded p-1" aria-label="Back to dashboard">
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </Link>
            <h1 className="text-2xl font-bold text-slate-800">System Settings</h1>
          </div>
          <button
            onClick={toggleDarkMode}
            className="flex items-center space-x-2 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors font-medium border border-slate-300"
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            <span>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
        </div>

        <div className="border-b border-slate-200 mb-8">
          <nav className="-mb-px flex space-x-8" aria-label="Settings Tabs" role="tablist">
            <button
              id="tab-dropdowns"
              role="tab"
              aria-selected={activeTab === 'dropdowns'}
              aria-controls="panel-dropdowns"
              type="button"
              onClick={() => setActiveTab('dropdowns')}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 rounded-t-sm ${activeTab === 'dropdowns' ? 'border-sky-500 text-sky-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
            >
              <div className="flex items-center">
                <ListFilter className="w-5 h-5 mr-2" aria-hidden="true" />
                Dropdown Options
              </div>
            </button>
            {(role === 'ADMIN' || role === 'ADMIN1') && (
              <button
                id="tab-users"
                role="tab"
                aria-selected={activeTab === 'users'}
                aria-controls="panel-users"
                type="button"
                onClick={() => setActiveTab('users')}
                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 rounded-t-sm ${activeTab === 'users' ? 'border-sky-500 text-sky-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
              >
                <div className="flex items-center">
                  <Users className="w-5 h-5 mr-2" aria-hidden="true" />
                  Users
                </div>
              </button>
            )}
            <button
              id="tab-projects"
              role="tab"
              aria-selected={activeTab === 'projects'}
              aria-controls="panel-projects"
              type="button"
              onClick={() => setActiveTab('projects')}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 rounded-t-sm ${activeTab === 'projects' ? 'border-sky-500 text-sky-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
            >
              <div className="flex items-center">
                <Briefcase className="w-5 h-5 mr-2" aria-hidden="true" />
                Projects
              </div>
            </button>
            <button
              id="tab-bypass"
              role="tab"
              aria-selected={activeTab === 'bypass_passports'}
              aria-controls="panel-bypass"
              type="button"
              onClick={() => setActiveTab('bypass_passports')}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 rounded-t-sm ${activeTab === 'bypass_passports' ? 'border-sky-500 text-sky-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
            >
              <div className="flex items-center">
                <ShieldCheck className="w-5 h-5 mr-2" aria-hidden="true" />
                Bypassed Passports
              </div>
            </button>
            <button
              id="tab-entitlement-logs"
              role="tab"
              aria-selected={activeTab === 'entitlement_logs'}
              aria-controls="panel-entitlement-logs"
              type="button"
              onClick={() => setActiveTab('entitlement_logs')}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 rounded-t-sm ${activeTab === 'entitlement_logs' ? 'border-sky-500 text-sky-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
            >
              <div className="flex items-center">
                <History className="w-5 h-5 mr-2" aria-hidden="true" />
                Entitlement Logs
              </div>
            </button>
            {(role === 'ADMIN' || role === 'ADMIN1') && (
              <button
                id="tab-sharepoint"
                role="tab"
                aria-selected={activeTab === 'sharepoint'}
                aria-controls="panel-sharepoint"
                type="button"
                onClick={() => setActiveTab('sharepoint')}
                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 rounded-t-sm ${activeTab === 'sharepoint' ? 'border-sky-500 text-sky-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
              >
                <div className="flex items-center">
                  <Cloud className="w-5 h-5 mr-2" aria-hidden="true" />
                  Cloud Exporters
                </div>
              </button>
            )}
          </nav>
        </div>

        {activeTab === 'dropdowns' && (
          <div id="panel-dropdowns" role="tabpanel" aria-labelledby="tab-dropdowns">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-8">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Add New Option</h2>
              <form onSubmit={handleAddOption} className="flex flex-col md:flex-row gap-4 mb-6">
                <div className="md:w-1/3">
                  <select 
                    value={newOption.category} 
                    onChange={e => setNewOption({...newOption, category: e.target.value})}
                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 outline-none"
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div className="md:w-1/2">
                  <input 
                    name="optionValue"
                    type="text" 
                    placeholder="Value..."
                    value={newOption.value}
                    onChange={e => {
                      setNewOption({...newOption, value: e.target.value});
                      handleValidationChange(e);
                    }}
                    onBlur={handleBlur}
                    className={`w-full p-2 border ${errors.optionValue ? 'border-red-500' : 'border-slate-300'} rounded-lg focus:ring-2 focus:ring-slate-500 outline-none`}
                    required
                  />
                  <FieldError error={errors.optionValue} />
                </div>
                <div className="md:w-auto">
                  <button disabled={adding} type="submit" className="w-full flex items-center justify-center px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-medium transition-colors disabled:opacity-50">
                    <Plus className="h-5 w-5 mr-1" /> Add Option
                  </button>
                </div>
              </form>
              
              {role === 'ADMIN' && (
                <div className="border-t pt-4 mt-6">
                  <h2 className="text-lg font-semibold text-red-600 mb-2">Danger Zone</h2>
                  <p className="text-sm text-slate-600 mb-4">Reset all system data (testing purpose).</p>
                  <button onClick={handleResetData} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg">
                    Clear Database (Reset)
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {categories.map(category => {
                const categoryOptions = Array.isArray(options) ? options.filter(o => o.category === category.id) : [];
                return (
                  <div key={category.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="bg-slate-100 p-4 border-b border-slate-200">
                      <h3 className="font-semibold text-slate-800 flex justify-between items-center">
                        {category.label}
                        <span className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded-full">{categoryOptions.length}</span>
                      </h3>
                    </div>
                    <div className="p-0">
                      {categoryOptions.length === 0 ? (
                        <div className="p-4 text-sm text-slate-500 italic text-center">No options defined</div>
                      ) : (
                    <ul className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                      {categoryOptions.map((opt, idx) => (
                        <li key={opt.id || `opt-${idx}`} className="p-3 pl-4 flex justify-between items-center hover:bg-slate-50">
                          {editingOption?.id === opt.id ? (
                            <form className="flex space-x-2 flex-1 mr-2" onSubmit={(e) => handleUpdateOption(e, opt.id)}>
                              <input 
                                type="text" 
                                autoFocus
                                value={editingOption.value} 
                                onChange={e => setEditingOption({...editingOption, value: e.target.value})}
                                className="flex-1 p-1 border border-slate-300 rounded focus:ring-1 focus:ring-sky-500 outline-none text-sm"
                              />
                              <button type="submit" className="text-sm bg-sky-600 text-white px-2 py-1 rounded hover:bg-sky-700">Save</button>
                              <button type="button" onClick={() => setEditingOption(null)} className="text-sm bg-slate-200 text-slate-700 px-2 py-1 rounded hover:bg-slate-300">Cancel</button>
                            </form>
                          ) : (
                            <>
                              <span className="text-sm font-medium text-slate-700" onDoubleClick={() => setEditingOption({id: opt.id, value: opt.value})}>{opt.value}</span>
                              <div className="flex space-x-1">
                                <button onClick={() => setEditingOption({id: opt.id, value: opt.value})} className="text-slate-400 hover:text-sky-600 p-1.5 rounded transition-colors" title="Edit">
                                  <span className="text-xs font-semibold">EDIT</span>
                                </button>
                                {role === 'ADMIN' && (
                                  <button onClick={() => handleDeleteOption(opt.id)} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded transition-colors" title="Delete">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(role === 'ADMIN' || role === 'ADMIN1') && activeTab === 'users' && (
          <div id="panel-users" role="tabpanel" aria-labelledby="tab-users" className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sticky top-6">
                <h2 className="text-lg font-semibold text-slate-800 mb-4">Add Profile/User</h2>
                <form onSubmit={handleAddUser} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                    <input 
                      name="full_name"
                      type="text" 
                      value={newUser.full_name}
                      onChange={e => { setNewUser({...newUser, full_name: e.target.value}); handleValidationChange(e); }}
                      onBlur={handleBlur}
                      className={`w-full p-2 border ${errors.full_name ? 'border-red-500' : 'border-slate-300'} rounded-lg outline-none focus:ring-2 focus:ring-slate-500`}
                      required
                    />
                    <FieldError error={errors.full_name} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                    <input 
                      name="email"
                      type="email" 
                      value={newUser.email}
                      onChange={e => { setNewUser({...newUser, email: e.target.value}); handleValidationChange(e); }}
                      onBlur={handleBlur}
                      className={`w-full p-2 border ${errors.email ? 'border-red-500' : 'border-slate-300'} rounded-lg outline-none focus:ring-2 focus:ring-slate-500`}
                      required
                    />
                    <FieldError error={errors.email} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                    <input 
                      name="password"
                      type="password" 
                      value={newUser.password}
                      onChange={e => { setNewUser({...newUser, password: e.target.value}); handleValidationChange(e); }}
                      onBlur={handleBlur}
                      className={`w-full p-2 border ${errors.password ? 'border-red-500' : 'border-slate-300'} rounded-lg outline-none focus:ring-2 focus:ring-slate-500`}
                      required
                    />
                    <FieldError error={errors.password} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                    <select 
                      value={newUser.role}
                      onChange={e => setNewUser({...newUser, role: e.target.value})}
                      className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-slate-500"
                    >
                      <option value="ADMIN1">Admin 1 (creates tickets, edits Stage 1)</option>
                      <option value="AGENT">Travel Agent (updates flight status, Stage 2)</option>
                      <option value="MANAGER">Manager (view reports and dashboard)</option>
                      <option value="FINANCE">Finance (ERP entries, Stage 3)</option>
                      <option value="ADMIN">Admin (full access)</option>
                    </select>
                  </div>
                  <button disabled={adding} type="submit" className="w-full flex items-center justify-center px-4 py-2 mt-4 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-medium transition-colors disabled:opacity-50">
                    <Plus className="h-5 w-5 mr-1" /> Add User
                  </button>
                </form>
              </div>
            </div>
            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-100 p-4 border-b border-slate-200">
                  <h3 className="font-semibold text-slate-800">Active Users ({users.length})</h3>
                </div>
                <div className="p-0 overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Email</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Role</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      {users.map((u, idx) => (
                        <tr key={u.id || `user-${idx}`} className="hover:bg-slate-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{u.full_name}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{u.email}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{u.role}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            {role === 'ADMIN' && u.id !== currentUser?.id && (
                              <button onClick={() => handleDeleteUser(u.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded transition-colors" title="Deactivate">
                                <Trash2 className="h-4 w-4 inline" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'projects' && (
          <div id="panel-projects" role="tabpanel" aria-labelledby="tab-projects" className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sticky top-6">
                <h2 className="text-lg font-semibold text-slate-800 mb-4">Add Project</h2>
                <form onSubmit={handleAddProject} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Project Name *</label>
                    <input 
                      name="project_name"
                      type="text" 
                      value={newProject.name}
                      onChange={e => { setNewProject({...newProject, name: e.target.value}); handleValidationChange(e); }}
                      onBlur={handleBlur}
                      className={`w-full p-2 border ${errors.project_name ? 'border-red-500' : 'border-slate-300'} rounded-lg outline-none focus:ring-2 focus:ring-slate-500`}
                      required
                    />
                    <FieldError error={errors.project_name} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Re; company</label>
                    <input 
                      type="text" 
                      value={newProject.company}
                      onChange={e => setNewProject({...newProject, company: e.target.value})}
                      className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-slate-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Country</label>
                    <input 
                      type="text" 
                      value={newProject.country}
                      onChange={e => setNewProject({...newProject, country: e.target.value})}
                      className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-slate-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Allocated Budget</label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={newProject.budget_allocated}
                      onChange={e => setNewProject({...newProject, budget_allocated: e.target.value})}
                      className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-slate-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Initial Entitlements</label>
                    <input 
                      type="number" 
                      min="0"
                      value={newProject.entitlement_total}
                      onChange={e => setNewProject({...newProject, entitlement_total: e.target.value})}
                      placeholder="e.g., 50"
                      className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-slate-500"
                    />
                  </div>
                  <button disabled={adding} type="submit" className="w-full flex items-center justify-center px-4 py-2 mt-4 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-medium transition-colors disabled:opacity-50">
                    <Plus className="h-5 w-5 mr-1" /> Add Project
                  </button>
                </form>
              </div>
            </div>
            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-100 p-4 border-b border-slate-200">
                  <h3 className="font-semibold text-slate-800">Projects ({projects.length})</h3>
                </div>
                <div className="p-0 overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Re; company</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Country</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Budget</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Initial Entitlements</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      {projects.map((p, idx) => {
                        if (editingProjectId === p.id) {
                          return (
                            <tr key={p.id || `editing-proj-${idx}`} className="bg-sky-50/20">
                              <td className="px-4 py-3 text-sm">
                                <input 
                                  value={editingProjectData.name}
                                  onChange={e => setEditingProjectData({ ...editingProjectData, name: e.target.value })}
                                  className="w-full p-1.5 border border-slate-300 rounded text-slate-900 text-xs font-semibold"
                                  required
                                />
                              </td>
                              <td className="px-4 py-3 text-sm">
                                <input 
                                  value={editingProjectData.company}
                                  onChange={e => setEditingProjectData({ ...editingProjectData, company: e.target.value })}
                                  className="w-full p-1.5 border border-slate-300 rounded text-slate-900 text-xs"
                                />
                              </td>
                              <td className="px-4 py-3 text-sm">
                                <input 
                                  value={editingProjectData.country}
                                  onChange={e => setEditingProjectData({ ...editingProjectData, country: e.target.value })}
                                  className="w-full p-1.5 border border-slate-300 rounded text-slate-900 text-xs"
                                />
                              </td>
                              <td className="px-4 py-3 text-sm">
                                <input 
                                  type="number"
                                  value={editingProjectData.budget_allocated}
                                  onChange={e => setEditingProjectData({ ...editingProjectData, budget_allocated: e.target.value })}
                                  className="w-full p-1.5 border border-slate-300 rounded text-slate-900 text-xs"
                                />
                              </td>
                              <td className="px-4 py-3 text-sm">
                                <input 
                                  type="number"
                                  min="0"
                                  value={editingProjectData.entitlement_total}
                                  onChange={e => setEditingProjectData({ ...editingProjectData, entitlement_total: e.target.value })}
                                  className="w-full p-1.5 border border-slate-300 rounded text-slate-900 text-xs font-mono font-semibold text-sky-700 bg-sky-50/50"
                                />
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-right text-xs font-medium space-x-1">
                                <button 
                                  onClick={() => handleUpdateProject(p.id)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1 px-3 rounded shadow-sm"
                                  title="Save project changes"
                                >
                                  Save
                                </button>
                                <button 
                                  onClick={() => { setEditingProjectId(null); setEditingProjectData(null); }}
                                  className="bg-slate-200 hover:bg-slate-300 text-slate-700 py-1 px-3 rounded"
                                >
                                  Cancel
                                </button>
                              </td>
                            </tr>
                          );
                        }

                        return (
                          <tr key={p.id || `proj-${idx}`} className="hover:bg-slate-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{p.name}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{p.company || '-'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{p.country || '-'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{p.budget_allocated ? p.budget_allocated.toLocaleString() : '-'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 font-mono font-bold bg-slate-50/25 text-center">{p.entitlement_total !== undefined ? p.entitlement_total : '0'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-1.5">
                              <button 
                                onClick={() => {
                                  setEditingProjectId(p.id);
                                  setEditingProjectData({
                                    name: p.name,
                                    company: p.company || '',
                                    country: p.country || '',
                                    budget_allocated: p.budget_allocated || 0,
                                    entitlement_total: p.entitlement_total || 0,
                                    company_entitlements: p.company_entitlements || {}
                                  });
                                }}
                                className="text-sky-600 hover:text-sky-800 hover:bg-sky-50 p-2 rounded transition-colors" 
                                title="Edit inline"
                              >
                                <Edit2 className="h-4 w-4 inline" />
                              </button>
                              {role === 'ADMIN' && (
                                <button onClick={() => handleDeleteProject(p.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded transition-colors" title="Delete">
                                  <Trash2 className="h-4 w-4 inline" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Project Re; company Entitlements Configurator as a full-width item inside panel-projects grid */}
            <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-4">
              <div className="bg-slate-100 p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <span className="w-1.5 h-4 bg-sky-500 rounded" />
                    Configure Ticket Entitlements per Re; company
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Set the pre-agreed starting allowance of tickets for each Re; company under a specific project.
                  </p>
                </div>
                {selectedEntitlementProjId && (
                  <button
                    onClick={handleSaveCompanyEntitlements}
                    disabled={isSavingEntitlements}
                    className="bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold py-1.5 px-4 rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 transition-colors"
                  >
                    {isSavingEntitlements ? 'Saving...' : 'Save Entitlements'}
                  </button>
                )}
              </div>
              <div className="p-6">
                <div className="max-w-md mb-6">
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Select Project *</label>
                  <select
                    value={selectedEntitlementProjId}
                    onChange={(e) => {
                      const projId = e.target.value;
                      setSelectedEntitlementProjId(projId);
                      const proj = projects.find(p => p.id === projId);
                      if (proj) {
                        const ents = proj.company_entitlements || {};
                        const cycles = proj.company_entitlement_cycles || {};
                        const periods = proj.company_entitlement_periods || {};
                        const starts = proj.company_entitlement_starts || {};

                        const companyOptions = options.filter(o => o.category === 'COMPANY');
                        const prepopulatedEnts: Record<string, string> = {};
                        const prepopulatedCycles: Record<string, 'MONTHLY' | 'PROJECT_PERIOD'> = {};
                        const prepopulatedPeriods: Record<string, string> = {};
                        const prepopulatedStarts: Record<string, string> = {};

                        companyOptions.forEach(o => {
                          prepopulatedEnts[o.value] = ents[o.value] !== undefined ? String(ents[o.value]) : '0';
                          prepopulatedCycles[o.value] = cycles[o.value] || 'PROJECT_PERIOD';
                          prepopulatedPeriods[o.value] = periods[o.value] !== undefined ? String(periods[o.value]) : '12';
                          prepopulatedStarts[o.value] = starts[o.value] || getTodayStr();
                        });

                        setCompanyEntitlementInputs(prepopulatedEnts);
                        setCompanyEntitlementCycles(prepopulatedCycles);
                        setCompanyEntitlementPeriods(prepopulatedPeriods);
                        setCompanyEntitlementStarts(prepopulatedStarts);
                      } else {
                        setCompanyEntitlementInputs({});
                        setCompanyEntitlementCycles({});
                        setCompanyEntitlementPeriods({});
                        setCompanyEntitlementStarts({});
                      }
                    }}
                    className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-sky-500 text-slate-800"
                  >
                    <option value="">-- Choose a project to configure --</option>
                    {projects.map((p, idx) => (
                      <option key={p.id || `opt-proj-${idx}`} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {!selectedEntitlementProjId ? (
                  <div className="text-center py-8 text-slate-400 text-xs italic bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                    Please select a project from the dropdown above to view and configure its company-specific starting ticket entitlements.
                  </div>
                ) : (
                  <div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {options.filter(o => o.category === 'COMPANY').length === 0 ? (
                        <div className="col-span-full text-center py-4 text-slate-400 text-xs text-slate-500">
                          No Re; company options found. Please add company options under the "Dropdown Options" tab first.
                        </div>
                      ) : (
                        options.filter(o => o.category === 'COMPANY').map((comp, idx) => {
                          const currentCycle = companyEntitlementCycles[comp.value] || 'PROJECT_PERIOD';
                          return (
                            <div key={comp.id || `comp-ent-${idx}`} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
                              <div>
                                <span className="text-sm font-extrabold text-slate-800 block truncate border-b border-slate-100 pb-2 mb-3 text-sky-700" title={comp.value}>
                                  {comp.value}
                                </span>
                                
                                <div className="space-y-3">
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Starting Ticket Entitlements</label>
                                    <input
                                      type="number"
                                      min="0"
                                      value={companyEntitlementInputs[comp.value] ?? '0'}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setCompanyEntitlementInputs(prev => ({
                                          ...prev,
                                          [comp.value]: val
                                        }));
                                      }}
                                      className="w-full p-1.5 border border-slate-300 rounded text-sm text-slate-900 font-mono font-bold focus:ring-2 focus:ring-sky-500 outline-none"
                                      placeholder="0"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Entitlement Cycle Type</label>
                                    <select
                                      value={currentCycle}
                                      onChange={(e) => {
                                        const val = e.target.value as 'MONTHLY' | 'PROJECT_PERIOD';
                                        setCompanyEntitlementCycles(prev => ({
                                          ...prev,
                                          [comp.value]: val
                                        }));
                                      }}
                                      className="w-full p-1.5 border border-slate-300 rounded text-xs text-slate-800 font-medium focus:ring-2 focus:ring-sky-500 outline-none bg-slate-50"
                                    >
                                      <option value="PROJECT_PERIOD">Project Period</option>
                                      <option value="MONTHLY">Renew Every Month (Monthly)</option>
                                    </select>
                                  </div>

                                  {currentCycle === 'PROJECT_PERIOD' ? (
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Months</label>
                                        <input
                                          type="number"
                                          min="1"
                                          value={companyEntitlementPeriods[comp.value] ?? '12'}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            setCompanyEntitlementPeriods(prev => ({
                                              ...prev,
                                              [comp.value]: val
                                            }));
                                          }}
                                          className="w-full p-1 border border-slate-300 rounded text-xs text-slate-900 font-mono focus:ring-2 focus:ring-sky-500 outline-none"
                                          placeholder="12"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Start Date</label>
                                        <input
                                          type="date"
                                          value={companyEntitlementStarts[comp.value] ?? getTodayStr()}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            setCompanyEntitlementStarts(prev => ({
                                              ...prev,
                                              [comp.value]: val
                                            }));
                                          }}
                                          className="w-full p-1 border border-slate-300 rounded text-xs text-slate-900 font-mono focus:ring-2 focus:ring-sky-500 outline-none"
                                        />
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="p-2 bg-sky-50 text-sky-700 text-[10px] rounded-lg border border-sky-100 flex items-start gap-1 leading-normal">
                                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                      <span>Starting allowance automatically renews each calendar month.</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'bypass_passports' && (
          <div id="panel-bypass" role="tabpanel" aria-labelledby="tab-bypass" className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sticky top-6">
                <h2 className="text-lg font-semibold text-slate-800 mb-4">Add Passport to Bypass List</h2>
                <p className="text-xs text-slate-500 mb-4">
                  Passengers with passport numbers added here bypass monthly travel frequency and duplicate check limits.
                </p>
                <form onSubmit={handleAddBypass} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Passport Number *</label>
                    <input 
                      name="pp_number"
                      type="text" 
                      placeholder="e.g. A12345678"
                      value={newBypass.pp_number}
                      onChange={e => setNewBypass({...newBypass, pp_number: e.target.value})}
                      className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-slate-500 uppercase"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Passenger Name *</label>
                    <input 
                      name="bypass_name"
                      type="text" 
                      placeholder="e.g. John Doe"
                      value={newBypass.name}
                      onChange={e => setNewBypass({...newBypass, name: e.target.value})}
                      className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-slate-500"
                      required
                    />
                  </div>
                  <button disabled={adding} type="submit" className="w-full flex items-center justify-center px-4 py-2 mt-4 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-medium transition-colors disabled:opacity-50">
                    <Plus className="h-5 w-5 mr-1" /> Add Passport
                  </button>
                </form>
              </div>
            </div>
            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-100 p-4 border-b border-slate-200">
                  <h3 className="font-semibold text-slate-800">Bypassed Passports ({bypassPassports.length})</h3>
                </div>
                <div className="p-0 overflow-x-auto">
                  {bypassPassports.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 italic">
                      No passport numbers bypass duplicate booking rules currently.
                    </div>
                  ) : (
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Passport Number</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Passenger Name</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-200">
                        {bypassPassports.map((bp, idx) => (
                          <tr key={bp.id || `bp-${idx}`} className="hover:bg-slate-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-bold text-slate-900">{bp.pp_number}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">{bp.name}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              {role === 'ADMIN' && (
                                <button onClick={() => handleDeleteBypass(bp.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded transition-colors" title="Remove bypass">
                                  <Trash2 className="h-4 w-4 inline" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'entitlement_logs' && (
          <div id="panel-entitlement-logs" role="tabpanel" aria-labelledby="tab-entitlement-logs" className="space-y-8">
            {/* Sub-contractor Ticket Entitlements Status Section */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <span className="inline-block w-2.5 h-5 bg-sky-500 rounded-sm" />
                    Sub-contractor Ticket Entitlements Status
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Displays pre-agreed ticket entitlements set per project and Re; company, along with tickets applied and remaining allowances.
                  </p>
                </div>
                <div className="flex items-center gap-3 self-start sm:self-auto">
                  <button
                    onClick={handleDownloadEntitlementsReport}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-lg shadow-sm border border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all cursor-pointer"
                    title="Export Current Remaining or Exceeded Amounts as Excel CSV"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Excel Report
                  </button>
                  <div className="text-xs bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg border border-slate-200 font-mono font-medium">
                    Total Managed Projects: {subcontractorEntitlementsData.length}
                  </div>
                </div>
              </div>

              {subcontractorEntitlementsData.length === 0 ? (
                <div className="text-center text-xs text-slate-400 py-8 italic">
                  No active projects with entitlement parameters found. You can set starting entitlements in settings under the "Projects" list tab.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-150 shadow-3xs">
                  <table className="min-w-full divide-y divide-slate-150">
                    <thead className="bg-slate-50">
                      <tr>
                        <th scope="col" className="px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Project Name</th>
                        <th scope="col" className="px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Re; company</th>
                        <th scope="col" className="px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Cycle / Period Type</th>
                        <th scope="col" className="px-5 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Initial Limit</th>
                        <th scope="col" className="px-5 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Applied Count</th>
                        <th scope="col" className="px-5 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Remaining Allowance</th>
                        <th scope="col" className="px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Period Warnings / Reset info</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-150">
                      {subcontractorEntitlementsData.map((item, idx) => (
                        <tr key={`${item.projectId}-${item.company}-${idx}`} className="hover:bg-slate-50/75 transition-colors">
                          <td className="px-5 py-3.5 whitespace-nowrap text-sm font-semibold text-slate-800">{item.projectName}</td>
                          <td className="px-5 py-3.5 whitespace-nowrap text-sm text-slate-600 font-medium">{item.company}</td>
                          <td className="px-5 py-3.5 whitespace-nowrap text-sm text-slate-600 font-medium">
                            {item.cycle === 'MONTHLY' ? (
                              <span className="inline-flex items-center gap-1 bg-sky-50 text-sky-700 px-2 py-0.5 rounded text-[11px] font-bold border border-sky-150">
                                🗓️ Monthly Renew
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 px-2 py-0.5 rounded text-[11px] font-bold border border-purple-150">
                                🏗️ Project Period ({item.duration}M)
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap text-center text-sm font-mono text-slate-700">{item.initial}</td>
                          <td className="px-5 py-3.5 whitespace-nowrap text-center text-sm font-mono text-amber-600 font-semibold">
                            {item.applied}
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap text-center">
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold font-mono ${
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
                          <td className="px-5 py-3.5 text-sm">
                            {item.cycle === 'MONTHLY' ? (
                              <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                                Resets every calendar month
                              </span>
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                {item.startDate ? (
                                  <span className="text-[11px] text-slate-500 font-medium">
                                    Started: <strong>{item.startDate}</strong>
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-400 italic">No start date set</span>
                                )}
                                {item.isExpired ? (
                                  <span className="inline-flex items-center text-[10px] bg-rose-50 border border-rose-200 text-rose-700 px-1.5 py-0.2 rounded font-bold self-start animate-pulse mt-0.5">
                                    ⚠️ {item.expirationWarningStr}
                                  </span>
                                ) : item.startDate ? (
                                  <span className="inline-flex items-center text-[10px] bg-emerald-50 border border-emerald-200 text-emerald-700 px-1.5 py-0.2 rounded font-medium self-start mt-0.5">
                                    ✅ active ({item.expirationWarningStr})
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

            {/* Existing Deductions History Block */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Entitlement Deductions History</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Chronological audit log showing ticket entitlement deductions, authorizing system administrators, and when.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative min-w-[240px]">
                    <input
                      type="text"
                      placeholder="Search passengers, projects, authorizers..."
                      value={entitlementLogSearch}
                      onChange={(e) => setEntitlementLogSearch(e.target.value)}
                      className="w-full text-sm p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-sky-500 bg-slate-50 focus:bg-white transition-colors"
                    />
                    {entitlementLogSearch && (
                      <button 
                        onClick={() => setEntitlementLogSearch('')}
                        className="absolute right-2.5 top-2.5 px-1 text-xs text-slate-400 hover:text-slate-600 font-bold"
                        title="Clear search"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <button
                    onClick={handleExportEntitlementLogs}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-semibold transition-colors shadow-2xs"
                  >
                    CSV Export
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-150">
                {entitlementTickets.length === 0 ? (
                  <div className="p-12 text-center text-slate-500 italic">
                    {entitlementLogSearch.trim() 
                      ? 'No items found matching your search filter.' 
                      : 'No entitlement deductions checked/applied in system tickets.'}
                  </div>
                ) : (
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Date &amp; Time</th>
                        <th className="px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Passenger / Employee</th>
                        <th className="px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Project Name</th>
                        <th className="px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Re; Company</th>
                        <th className="px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Cycle Type</th>
                        <th className="px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Authorized By</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-150">
                      {entitlementTickets.map((item, idx) => (
                        <tr key={`${item.id}-${idx}`} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-5 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">
                            {item.formattedDate}
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap">
                            <div className="text-sm font-semibold text-slate-800">{item.passengerName}</div>
                            <div className="text-xs text-slate-500 font-mono mt-0.5">Passport: {item.ppNumber}</div>
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap text-sm text-slate-700">
                            {item.projectName}
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap text-sm text-slate-600 font-medium">
                            {item.company}
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap">
                            {item.cycleType === 'MONTHLY' ? (
                              <span className="inline-flex items-center bg-sky-50 text-sky-700 px-2 py-0.5 rounded text-[11px] font-bold border border-sky-150">
                                🗓️ Monthly Reset
                              </span>
                            ) : (
                              <span className="inline-flex items-center bg-purple-50 text-purple-700 px-2 py-0.5 rounded text-[11px] font-bold border border-purple-150">
                                🏗️ Project Period
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap">
                            <div className="text-sm font-semibold text-slate-800">{item.authorizerName}</div>
                            <div className="text-[11px] text-slate-500">{item.authorizerEmail} <span className="ml-1 bg-slate-100 px-1 py-0.2 rounded text-[9px] font-bold uppercase">{item.authorizerRole}</span></div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'sharepoint' && (
          <div id="panel-sharepoint" role="tabpanel" aria-labelledby="tab-sharepoint" className="space-y-6 animate-fade-in">
            {/* Sub-tabs for Cloud Exporters */}
            <div className="flex space-x-1 border-b border-slate-200 pb-px mb-2">
              <button
                type="button"
                onClick={() => setCloudSubTab('sharepoint')}
                className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-all -mb-px ${
                  cloudSubTab === 'sharepoint'
                    ? 'border-sky-500 text-sky-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Microsoft SharePoint
              </button>
              <button
                type="button"
                onClick={() => setCloudSubTab('gdrive')}
                className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-all -mb-px ${
                  cloudSubTab === 'gdrive'
                    ? 'border-sky-500 text-sky-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Google Drive
              </button>
            </div>

            {cloudSubTab === 'sharepoint' ? (
              <div className="space-y-8">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
                    <div>
                      <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <span className="inline-block w-2.5 h-5 bg-sky-500 rounded-sm" />
                        SharePoint Exporter Schedule Config
                      </h2>
                      <p className="text-xs text-slate-500 mt-1">
                        Configure your Microsoft 365 Entra ID credentials to automatically upload the Air Ticket Summary Sheet to your SharePoint library.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleManualSharepointSync}
                        disabled={sharepointSyncing || sharepointLoading}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold shadow-xs cursor-pointer transition-colors"
                      >
                        <RefreshCw className={`w-4 h-4 ${sharepointSyncing ? 'animate-spin' : ''}`} />
                        Sync &amp; Upload Now
                      </button>
                    </div>
                  </div>

                  {sharepointLoading ? (
                    <div className="flex justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
                    </div>
                  ) : (
                    <form onSubmit={handleSaveSharepointConfig} className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Active State */}
                        <div className="col-span-1 md:col-span-2 bg-slate-50 border border-slate-200 p-4 rounded-xl flex items-center justify-between">
                          <div>
                            <h3 className="text-sm font-semibold text-slate-800">Enable SharePoint Automatic Exporter</h3>
                            <p className="text-xs text-slate-500 mt-0.5">When active, the automatic exporter will run scheduled uploads without manual intervention.</p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={sharepointConfig.enabled}
                              onChange={(e) => setSharepointConfig({ ...sharepointConfig, enabled: e.target.checked })}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500" />
                          </label>
                        </div>

                        {/* Microsoft Entra ID Config */}
                        <div className="space-y-4">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Microsoft Entra ID Credentials</h3>
                          
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">Microsoft Directory (Tenant) ID</label>
                            <input
                              type="text"
                              required={sharepointConfig.enabled}
                              placeholder="e.g. 12345678-abcd-1234-abcd-12345678abcd"
                              value={sharepointConfig.tenantId || ""}
                              onChange={(e) => setSharepointConfig({ ...sharepointConfig, tenantId: e.target.value })}
                              className="w-full text-sm p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-sky-500"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">Application (Client) ID</label>
                            <input
                              type="text"
                              required={sharepointConfig.enabled}
                              placeholder="e.g. 87654321-dcba-4321-dcba-87654321dcba"
                              value={sharepointConfig.clientId || ""}
                              onChange={(e) => setSharepointConfig({ ...sharepointConfig, clientId: e.target.value })}
                              className="w-full text-sm p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-sky-500"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">Application Client Secret</label>
                            <input
                              type="password"
                              required={sharepointConfig.enabled && !sharepointConfig.clientSecret}
                              placeholder="Enter client secret credentials"
                              value={sharepointConfig.clientSecret || ""}
                              onChange={(e) => setSharepointConfig({ ...sharepointConfig, clientSecret: e.target.value })}
                              className="w-full text-sm p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-sky-500"
                            />
                          </div>
                        </div>

                        {/* SharePoint Site and Library Destination */}
                        <div className="space-y-4">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">SharePoint Destination Library</h3>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">SharePoint Site URL</label>
                            <input
                              type="text"
                              required={sharepointConfig.enabled}
                              placeholder="e.g. https://sankenoverseas.sharepoint.com/sites/AirTickets"
                              value={sharepointConfig.siteUrl || ""}
                              onChange={(e) => setSharepointConfig({ ...sharepointConfig, siteUrl: e.target.value })}
                              className="w-full text-sm p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-sky-500"
                            />
                            <span className="text-[10px] text-slate-400 mt-1 block">Full URL or subsite path of your team directory.</span>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">Folder Destination Path</label>
                            <input
                              type="text"
                              placeholder="Shared Documents/Air Tickets"
                              value={sharepointConfig.folderPath || ""}
                              onChange={(e) => setSharepointConfig({ ...sharepointConfig, folderPath: e.target.value })}
                              className="w-full text-sm p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-sky-500"
                            />
                            <span className="text-[10px] text-slate-400 mt-1 block">Leave empty to store in the root document library.</span>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1">Timezone Offset (vs UTC)</label>
                              <select
                                value={sharepointConfig.timezoneOffset ?? 5.5}
                                onChange={(e) => setSharepointConfig({ ...sharepointConfig, timezoneOffset: Number(e.target.value) })}
                                className="w-full text-sm p-2.5 border border-slate-300 rounded-lg outline-none bg-white focus:ring-2 focus:ring-sky-500"
                              >
                                <option value="0">UTC +0:00 (GMT)</option>
                                <option value="1">UTC +1:00 (London/Paris)</option>
                                <option value="3">UTC +3:00 (Nairobi/Qatar)</option>
                                <option value="4">UTC +4:00 (Dubai)</option>
                                <option value="5">UTC +5:00 (Maldives)</option>
                                <option value="5.5">UTC +5:30 (Sri Lanka - Colombo / India)</option>
                                <option value="8">UTC +8:00 (Singapore)</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1">Weekly Upload Schedule</label>
                              <div className="flex gap-2">
                                <select
                                  value={sharepointConfig.uploadDay ?? 5}
                                  onChange={(e) => setSharepointConfig({ ...sharepointConfig, uploadDay: Number(e.target.value) })}
                                  className="flex-1 text-xs p-2.5 border border-slate-300 rounded-lg outline-none bg-white focus:ring-2 focus:ring-sky-500"
                                >
                                  <option value="1">Monday</option>
                                  <option value="2">Tuesday</option>
                                  <option value="3">Wednesday</option>
                                  <option value="4">Thursday</option>
                                  <option value="5">Friday</option>
                                  <option value="6">Saturday</option>
                                  <option value="0">Sunday</option>
                                </select>
                                <select
                                  value={sharepointConfig.uploadHour ?? 17}
                                  onChange={(e) => setSharepointConfig({ ...sharepointConfig, uploadHour: Number(e.target.value) })}
                                  className="flex-1 text-xs p-2.5 border border-slate-300 rounded-lg outline-none bg-white focus:ring-2 focus:ring-sky-500"
                                >
                                  {Array.from({ length: 24 }).map((_, h) => (
                                    <option key={h} value={h}>
                                      {h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end pt-4 border-t border-slate-100">
                        <button
                          type="submit"
                          disabled={sharepointSaving}
                          className="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-all shadow-xs cursor-pointer"
                        >
                          {sharepointSaving ? "Saving Settings..." : "Save SharePoint Configuration"}
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                {/* SharePoint History Logs */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <div>
                    <h2 className="text-md font-bold text-slate-800">Synchronization History Logs</h2>
                    <p className="text-xs text-slate-500 mt-1">Audit log tracking automatic Friday scheduler runs and manual uploads.</p>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-slate-150 mt-4">
                    {sharepointLogs.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 italic text-xs">
                        No synchronization logs recorded yet. Use the "Sync &amp; Upload Now" button to execute a test upload.
                      </div>
                    ) : (
                      <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Timestamp</th>
                            <th className="px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Trigger</th>
                            <th className="px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Filename</th>
                            <th className="px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Status</th>
                            <th className="px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Result / Errors</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-150">
                          {sharepointLogs.map((log: any) => (
                            <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                              <td className="px-5 py-3 whitespace-nowrap text-xs text-slate-500 font-mono">
                                {new Date(log.timestamp).toLocaleString()}
                              </td>
                              <td className="px-5 py-3 whitespace-nowrap">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  log.triggerType === "auto" 
                                    ? "bg-purple-50 text-purple-700 border border-purple-150" 
                                    : "bg-sky-50 text-sky-700 border border-sky-150"
                                }`}>
                                  {log.triggerType === "auto" ? "🗓️ Scheduled" : "⚡ Manual"}
                                </span>
                              </td>
                              <td className="px-5 py-3 whitespace-nowrap text-xs text-slate-700 font-medium">
                                {log.filename}
                              </td>
                              <td className="px-5 py-3 whitespace-nowrap">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                  log.status === "success" 
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                                    : "bg-rose-50 text-rose-700 border border-rose-200"
                                }`}>
                                  {log.status === "success" ? "Success" : "Failed"}
                                </span>
                              </td>
                              <td className="px-5 py-3 text-xs text-slate-600">
                                {log.status === "success" ? (
                                  <a
                                    href={log.webUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-800 font-semibold"
                                  >
                                    View on SharePoint
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                ) : (
                                  <span className="text-rose-600 font-mono break-all">{log.error}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-8 animate-fade-in">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
                    <div>
                      <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <span className="inline-block w-2.5 h-5 bg-sky-500 rounded-sm" />
                        Google Drive Exporter Config
                      </h2>
                      <p className="text-xs text-slate-500 mt-1">
                        Configure your Google account to automatically export and back up the Air Ticket Summary report to Google Drive.
                      </p>
                    </div>
                    {gdriveConfig.accessToken && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleManualGdriveSync}
                          disabled={gdriveSyncing || gdriveLoading}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold shadow-xs cursor-pointer transition-colors"
                        >
                          <RefreshCw className={`w-4 h-4 ${gdriveSyncing ? 'animate-spin' : ''}`} />
                          Sync &amp; Upload Now
                        </button>
                      </div>
                    )}
                  </div>

                  {gdriveLoading ? (
                    <div className="flex justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
                    </div>
                  ) : (
                    <form onSubmit={handleSaveGdriveConfig} className="space-y-6">
                      {gdriveConfig.accessTokenExpired && (
                        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs space-y-1.5 animate-fade-in col-span-1 md:col-span-2">
                          <p className="font-bold flex items-center gap-1.5 text-rose-950">
                            <span className="inline-block w-2.5 h-2.5 rounded-full bg-rose-600 animate-pulse" />
                            Google Drive Session Expired / Invalidated
                          </p>
                          <p className="text-rose-900 leading-relaxed">
                            {gdriveConfig.lastError || "Your Google Drive access token has expired or been invalidated (typical for Google APIs when using standard OAuth logins). The automatic exporter has been temporarily disabled. Please click \"Link Google Drive Account\" below to re-authenticate and re-enable automated backups."}
                          </p>
                        </div>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Active State */}
                        <div className="col-span-1 md:col-span-2 bg-slate-50 border border-slate-200 p-4 rounded-xl flex items-center justify-between">
                          <div>
                            <h3 className="text-sm font-semibold text-slate-800">Enable Google Drive Automatic Exporter</h3>
                            <p className="text-xs text-slate-500 mt-0.5">When active, the scheduled weekly backup will upload to your Google Drive.</p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              disabled={!gdriveConfig.accessToken}
                              checked={gdriveConfig.enabled && !!gdriveConfig.accessToken}
                              onChange={(e) => setGdriveConfig({ ...gdriveConfig, enabled: e.target.checked })}
                              className="sr-only peer text-sky-500"
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500 peer-disabled:opacity-50" />
                          </label>
                        </div>

                        {/* Connection Card */}
                        <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl flex flex-col justify-between space-y-4">
                          <div>
                            <h3 className="text-sm font-bold text-slate-800">Google Drive Connection</h3>
                            <p className="text-xs text-slate-500 mt-1">
                              Link your Google account to grant permission to save spreadsheets to your Google Drive.
                            </p>
                          </div>

                          {gdriveConfig.linkedEmail ? (
                            <div className="bg-emerald-50 border border-emerald-150 rounded-lg p-3 flex items-center justify-between">
                              <div className="truncate pr-2">
                                <span className="block text-[10px] uppercase font-bold text-emerald-800 tracking-wide">Linked Account</span>
                                <span className="text-xs font-semibold text-emerald-900 break-all">{gdriveConfig.linkedEmail}</span>
                              </div>
                              <button
                                type="button"
                                onClick={handleGoogleDriveLink}
                                className="shrink-0 text-xs text-emerald-700 hover:text-emerald-900 font-bold underline"
                              >
                                Reconnect
                              </button>
                            </div>
                          ) : (
                            <div>
                              <button
                                type="button"
                                onClick={handleGoogleDriveLink}
                                className="w-full inline-flex justify-center items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer shadow-sm"
                              >
                                Link Google Drive Account
                              </button>
                            </div>
                          )}

                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 text-xs text-amber-800 space-y-1.5">
                            <span className="font-bold flex items-center gap-1">⚠️ Crucial Google Drive Authorization Guide:</span>
                            <ul className="list-disc list-inside space-y-1 pl-1">
                              <li>
                                <strong>Unverified App Screen:</strong> Click <span className="underline font-bold">"Advanced"</span> (bottom-left of the Google popup) and then click <span className="underline font-bold">"Go to... (unsafe)"</span> to proceed.
                              </li>
                              <li>
                                <strong>Checkbox Permission (CRITICAL):</strong> On the permission grant screen, you <strong>MUST manually check the checkbox</strong> next to <em>"See, edit, create, and delete all of your Google Drive files"</em> (or <em>"only files you use with this app"</em>) before clicking <strong>Continue</strong>. If unchecked, the synchronization will fail with an "insufficient authentication scopes" error.
                              </li>
                            </ul>
                          </div>
                        </div>

                        {/* Folder Config */}
                        <div className="space-y-4">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Destination Settings</h3>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">Google Drive Folder Name</label>
                            <input
                              type="text"
                              required={gdriveConfig.enabled}
                              placeholder="e.g. Air Tickets Backup"
                              value={gdriveConfig.folderName || ""}
                              onChange={(e) => setGdriveConfig({ ...gdriveConfig, folderName: e.target.value })}
                              className="w-full text-sm p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-sky-500"
                            />
                            <span className="text-[10px] text-slate-400 mt-1 block">A folder with this name will be located or created in your drive.</span>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1">Timezone Offset (vs UTC)</label>
                              <select
                                value={gdriveConfig.timezoneOffset ?? 5.5}
                                onChange={(e) => setGdriveConfig({ ...gdriveConfig, timezoneOffset: Number(e.target.value) })}
                                className="w-full text-sm p-2.5 border border-slate-300 rounded-lg outline-none bg-white focus:ring-2 focus:ring-sky-500"
                              >
                                <option value="0">UTC +0:00 (GMT)</option>
                                <option value="1">UTC +1:00 (London/Paris)</option>
                                <option value="3">UTC +3:00 (Nairobi/Qatar)</option>
                                <option value="4">UTC +4:00 (Dubai)</option>
                                <option value="5">UTC +5:00 (Maldives)</option>
                                <option value="5.5">UTC +5:30 (Sri Lanka - Colombo / India)</option>
                                <option value="8">UTC +8:00 (Singapore)</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1">Weekly Upload Schedule</label>
                              <div className="flex gap-2">
                                <select
                                  value={gdriveConfig.uploadDay ?? 5}
                                  onChange={(e) => setGdriveConfig({ ...gdriveConfig, uploadDay: Number(e.target.value) })}
                                  className="flex-1 text-xs p-2.5 border border-slate-300 rounded-lg outline-none bg-white focus:ring-2 focus:ring-sky-500"
                                >
                                  <option value="1">Monday</option>
                                  <option value="2">Tuesday</option>
                                  <option value="3">Wednesday</option>
                                  <option value="4">Thursday</option>
                                  <option value="5">Friday</option>
                                  <option value="6">Saturday</option>
                                  <option value="0">Sunday</option>
                                </select>
                                <select
                                  value={gdriveConfig.uploadHour ?? 17}
                                  onChange={(e) => setGdriveConfig({ ...gdriveConfig, uploadHour: Number(e.target.value) })}
                                  className="flex-1 text-xs p-2.5 border border-slate-300 rounded-lg outline-none bg-white focus:ring-2 focus:ring-sky-500"
                                >
                                  {Array.from({ length: 24 }).map((_, h) => (
                                    <option key={h} value={h}>
                                      {h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end pt-4 border-t border-slate-100">
                        <button
                          type="submit"
                          disabled={gdriveSaving}
                          className="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-all shadow-xs cursor-pointer"
                        >
                          {gdriveSaving ? "Saving Settings..." : "Save Google Drive Configuration"}
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                {/* Disaster Recovery & Manual Database Backup */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                    <div>
                      <h2 className="text-md font-bold text-slate-800 flex items-center gap-2">
                        <span className="inline-block w-2.5 h-5 bg-amber-500 rounded-sm" />
                        Disaster Recovery &amp; Manual Database Backup
                      </h2>
                      <p className="text-xs text-slate-500 mt-1">
                        Trigger a full, manual JSON export of all Firestore database collections and upload them directly to your connected Google Drive folder.
                      </p>
                    </div>
                    {gdriveConfig.accessToken && (
                      <button
                        type="button"
                        onClick={handleManualGdriveBackup}
                        disabled={gdriveBackupSyncing || gdriveLoading}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold shadow-xs cursor-pointer transition-colors shrink-0"
                      >
                        <RefreshCw className={`w-4 h-4 ${gdriveBackupSyncing ? 'animate-spin' : ''}`} />
                        Backup Database to Drive
                      </button>
                    )}
                  </div>

                  <div className="mt-6">
                    {!gdriveConfig.accessToken ? (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center text-slate-500 space-y-2">
                        <AlertCircle className="w-8 h-8 text-slate-400 mx-auto" />
                        <h4 className="text-sm font-semibold text-slate-700">Google Drive is not linked</h4>
                        <p className="text-xs max-w-md mx-auto">
                          You must link your Google Drive account under the Google Drive Exporter section above to enable disaster recovery backups.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-4 flex gap-3">
                          <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                          <div className="text-xs text-amber-900 space-y-1">
                            <h4 className="font-bold">Automated Disaster Recovery Best Practices:</h4>
                            <p>Manual backups compile a snapshot of all active collections, including Users, Tickets, Projects, Tasks, and Settings. Download links will remain active on Google Drive for as long as the file exists in your drive folder.</p>
                          </div>
                        </div>

                        {/* Database Backup Logs */}
                        <div>
                          <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-1.5">
                            <History className="w-4 h-4 text-slate-500" />
                            Database Backup Logs
                          </h3>
                          <div className="overflow-x-auto rounded-lg border border-slate-150">
                            {gdriveBackupLogs.length === 0 ? (
                              <div className="p-8 text-center text-slate-400 italic text-xs">
                                No manual database backups have been logged yet.
                              </div>
                            ) : (
                              <table className="min-w-full divide-y divide-slate-200">
                                <thead className="bg-slate-50">
                                  <tr>
                                    <th className="px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Timestamp</th>
                                    <th className="px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Backup File</th>
                                    <th className="px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Status</th>
                                    <th className="px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Result / Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-150">
                                  {gdriveBackupLogs.map((log: any) => (
                                    <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                                      <td className="px-5 py-3 whitespace-nowrap text-xs text-slate-500 font-mono">
                                        {new Date(log.timestamp).toLocaleString()}
                                      </td>
                                      <td className="px-5 py-3 whitespace-nowrap text-xs text-slate-700 font-medium">
                                        {log.filename}
                                      </td>
                                      <td className="px-5 py-3 whitespace-nowrap">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                          log.status === "success" 
                                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                                            : "bg-rose-50 text-rose-700 border border-rose-200"
                                        }`}>
                                          {log.status === "success" ? "Success" : "Failed"}
                                        </span>
                                      </td>
                                      <td className="px-5 py-3 text-xs text-slate-600 font-medium">
                                        {log.status === "success" ? (
                                          <a
                                            href={log.webUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-800 font-semibold font-sans"
                                          >
                                            View Backup on Drive
                                            <ExternalLink className="w-3 h-3" />
                                          </a>
                                        ) : (
                                          <span className="text-rose-600 font-mono break-all">{log.error}</span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Google Drive History Logs */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <div>
                    <h2 className="text-md font-bold text-slate-800">Google Drive Synchronization History</h2>
                    <p className="text-xs text-slate-500 mt-1">Audit log tracking scheduled Friday backups and manual uploads to your Google Drive.</p>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-slate-150 mt-4">
                    {gdriveLogs.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 italic text-xs">
                        No Google Drive sync logs recorded yet. Use the "Sync &amp; Upload Now" button to execute a test upload.
                      </div>
                    ) : (
                      <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Timestamp</th>
                            <th className="px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Trigger</th>
                            <th className="px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Filename</th>
                            <th className="px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Status</th>
                            <th className="px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Result / Errors</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-150">
                          {gdriveLogs.map((log: any) => (
                            <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                              <td className="px-5 py-3 whitespace-nowrap text-xs text-slate-500 font-mono">
                                {new Date(log.timestamp).toLocaleString()}
                              </td>
                              <td className="px-5 py-3 whitespace-nowrap">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  log.triggerType === "auto" 
                                    ? "bg-purple-50 text-purple-700 border border-purple-150" 
                                    : "bg-sky-50 text-sky-700 border border-sky-150"
                                }`}>
                                  {log.triggerType === "auto" ? "🗓️ Scheduled" : "⚡ Manual"}
                                </span>
                              </td>
                              <td className="px-5 py-3 whitespace-nowrap text-xs text-slate-700 font-medium">
                                {log.filename}
                              </td>
                              <td className="px-5 py-3 whitespace-nowrap">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                  log.status === "success" 
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                                    : "bg-rose-50 text-rose-700 border border-rose-200"
                                }`}>
                                  {log.status === "success" ? "Success" : "Failed"}
                                </span>
                              </td>
                              <td className="px-5 py-3 text-xs text-slate-600 font-medium">
                                {log.status === "success" ? (
                                  <a
                                    href={log.webUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-800 font-semibold"
                                  >
                                    View on Google Drive
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                ) : (
                                  <span className="text-rose-600 font-mono break-all">{log.error}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {isAdminAuthModalOpen && (
        <div id="admin-user-auth-modal" className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 flex items-center">
                <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
                Admin Authorization Required
              </h3>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-600 rounded-full p-1 hover:bg-slate-100 transition-colors"
                onClick={() => {
                  setIsAdminAuthModalOpen(false);
                  setPendingUserAction(null);
                }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleAdminAuthorizedAction} className="mt-4 space-y-4">
              <p className="text-sm text-slate-600">
                You are currently logged in as <span className="font-semibold text-slate-800">Admin 1</span>. Managing users requires master <span className="font-semibold text-slate-800">Admin</span> credentials approval.
              </p>
              
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Master Admin Email
                </label>
                <input
                  required
                  type="email"
                  className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-slate-500 bg-slate-50 focus:bg-white text-sm"
                  placeholder="e.g. admin@sanken.com"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Master Admin Password
                </label>
                <input
                  required
                  type="password"
                  className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-slate-500 bg-slate-50 focus:bg-white text-sm"
                  placeholder="••••••••"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                />
              </div>

              <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  onClick={() => {
                    setIsAdminAuthModalOpen(false);
                    setPendingUserAction(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAuthorizing}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isAuthorizing ? "Authorizing..." : "Authorize & Proceed"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
