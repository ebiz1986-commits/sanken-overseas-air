import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api';
import { useAuthStore } from '../store';
import toast from 'react-hot-toast';
import { ArrowLeft, Clock, Save, Edit, AlertCircle, FileText, Upload, Trash2, Paperclip, Eye, Download, X, CheckCircle, Lock } from 'lucide-react';
import { format, differenceInDays, parseISO } from 'date-fns';
import { useFormValidation } from '../hooks/useFormValidation';
import FieldError from '../components/FieldError';
import EditStage1Modal from '../components/EditStage1Modal';
import { motion } from 'motion/react';
import { processAndCompressFile } from '../lib/fileCompressor';

export const isPdfUrl = (url: string | null): boolean => {
  if (!url) return false;
  return url.startsWith('data:application/pdf') || url.includes('.pdf') || url.includes('pdf;base64');
};

export const isWebUrl = (url: string | null): boolean => {
  if (!url) return false;
  return (url.startsWith('http://') || url.startsWith('https://')) && !url.startsWith('data:');
};

export default function TicketDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuthStore();
  const [ticketData, setTicketData] = useState<any>(null);
  const hasSecondTicket = !!(ticketData?.rescheduled_departure_date || ticketData?.other_invoice_number);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [options, setOptions] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditStage1ModalOpen, setIsEditStage1ModalOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const [isAdminAuthModalOpen, setIsAdminAuthModalOpen] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const [isScanningFirstInvoiceDetails, setIsScanningFirstInvoiceDetails] = useState(false);
  const [isScanningOtherInvoiceDetails, setIsScanningOtherInvoiceDetails] = useState(false);
  const [firstInvoiceNo, setFirstInvoiceNo] = useState('');
  const [otherInvoiceNo, setOtherInvoiceNo] = useState('');

  const { errors, handleBlur, handleChange: handleValidationChange, validateForm } = useFormValidation();

  // Form states
  const [stage2Data, setStage2Data] = useState({
    departure_date: '',
    arrival_date: '',
    flight_status: '',
    rescheduled_departure_date: '',
    rescheduled_ticket_amount: '',
    rescheduled_ticket_agent: '',
    rescheduled_ticket_date: '',
    rescheduled_flight_status: 'PENDING',
    rescheduled_arrival_date: ''
  });
  
  const [stage3Data, setStage3Data] = useState({
    po_number: '',
    po_date: '',
    invoice_number: '',
    invoice_date: '',
    po_status: 'pending po approval',
    po_remarks: '',
    invoice_amount: '',
    project_pos: {} as Record<string, string>
  });

  const [activeInvoiceType, setActiveInvoiceType] = useState<'first' | 'other'>('first');

  const updateStage3FormData = (ticket: any, type: 'first' | 'other') => {
    if (!ticket) return;
    if (type === 'other') {
      setStage3Data({
        po_number: ticket.other_po_number || '',
        po_date: ticket.other_po_date || '',
        invoice_number: ticket.other_invoice_number || '',
        invoice_date: ticket.other_invoice_date || '',
        po_status: ticket.other_po_status || 'pending po approval',
        po_remarks: ticket.other_po_remarks || '',
        invoice_amount: ticket.other_invoice_amount || ticket.rescheduled_ticket_amount || '',
        project_pos: ticket.other_project_pos || {}
      });
    } else {
      setStage3Data({
        po_number: ticket.po_number || '',
        po_date: ticket.po_date || '',
        invoice_number: ticket.invoice_number || ticket.first_invoice_number || '',
        invoice_date: ticket.invoice_date || ticket.first_invoice_date || '',
        po_status: ticket.po_status || 'pending po approval',
        po_remarks: ticket.po_remarks || '',
        invoice_amount: ticket.invoice_amount || ticket.approved_rate || ticket.price || '',
        project_pos: ticket.project_pos || {}
      });
    }
  };

  const [savingStage2, setSavingStage2] = useState(false);
  const [savingStage3, setSavingStage3] = useState(false);
  const [isAddingNewAgent, setIsAddingNewAgent] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    payment_date: '',
    payment_invoice_numbers: '',
    travel_agent: ''
  });
  const [isAddingNewPaymentAgent, setIsAddingNewPaymentAgent] = useState(false);
  const [newPaymentAgentName, setNewPaymentAgentName] = useState('');

  const [highlightFlightStatus, setHighlightFlightStatus] = useState(false);
  const [highlightRescheduledFlightStatus, setHighlightRescheduledFlightStatus] = useState(false);
  const [formFlightStatusHighlight, setFormFlightStatusHighlight] = useState(false);
  const [formRescheduledFlightStatusHighlight, setFormRescheduledFlightStatusHighlight] = useState(false);

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      const [ticketRes, usersRes, optionsRes, projectsRes] = await Promise.all([
        api.get(`/tickets/${id}`),
        api.get('/users'),
        api.get('/options'),
        api.get('/projects')
      ]);
      
      const newTicket = ticketRes.data.ticket;
      setTicketData((prev: any) => {
        if (prev) {
          if (prev.flight_status !== newTicket.flight_status) {
            setHighlightFlightStatus(true);
            setTimeout(() => setHighlightFlightStatus(false), 4000);
          }
          if (prev.rescheduled_flight_status !== newTicket.rescheduled_flight_status) {
            setHighlightRescheduledFlightStatus(true);
            setTimeout(() => setHighlightRescheduledFlightStatus(false), 4000);
          }
        }
        return newTicket;
      });
      
      setFirstInvoiceNo(newTicket.first_invoice_number || '');
      setOtherInvoiceNo(newTicket.other_invoice_number || '');
      setActivityLogs(Array.isArray(ticketRes.data?.activity) ? ticketRes.data.activity : []);
      setUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
      setOptions(Array.isArray(optionsRes.data) ? optionsRes.data : []);
      setProjects(Array.isArray(projectsRes.data) ? projectsRes.data : []);
      
      // Initialize form data
      const hasSecondTicket = !!(newTicket.rescheduled_departure_date || newTicket.other_invoice_number);
      setStage2Data({
        departure_date: newTicket.departure_date || '',
        arrival_date: newTicket.arrival_date || '',
        flight_status: hasSecondTicket ? 'NO_SHOW' : (newTicket.flight_status || 'PENDING'),
        rescheduled_departure_date: newTicket.rescheduled_departure_date || '',
        rescheduled_ticket_amount: newTicket.rescheduled_ticket_amount || '',
        rescheduled_ticket_agent: newTicket.rescheduled_ticket_agent || '',
        rescheduled_ticket_date: newTicket.rescheduled_ticket_date || '',
        rescheduled_flight_status: newTicket.rescheduled_flight_status || 'PENDING',
        rescheduled_arrival_date: newTicket.rescheduled_arrival_date || ''
      });
      
      updateStage3FormData(newTicket, activeInvoiceType);
      
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to load ticket details');
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTicket = async () => {
    console.log("handleDeleteTicket: role =", role);
    if (!window.confirm("Are you sure you want to permanently delete this entire ticket record? This action cannot be undone.")) {
      return;
    }

    if (role === 'ADMIN1') {
      console.log("Setting isAdminAuthModalOpen to true");
      setAdminEmail('');
      setAdminPassword('');
      setIsAdminAuthModalOpen(true);
      return;
    }

    // Standard ADMIN can delete directly
    setIsDeleting(true);
    try {
      await api.delete(`/tickets/${id}`);
      toast.success("Ticket record deleted successfully");
      navigate('/dashboard');
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to delete ticket record');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAdminAuthorizedDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminEmail.trim() || !adminPassword.trim()) {
      toast.error("Both Admin Email and Password are required");
      return;
    }

    setIsDeleting(true);
    try {
      await api.delete(`/tickets/${id}`, {
        headers: {
          'x-admin-email': encodeURIComponent(adminEmail.trim()),
          'x-admin-password': encodeURIComponent(adminPassword.trim())
        },
        data: {
          admin_email: adminEmail.trim(),
          admin_password: adminPassword.trim()
        }
      });
      toast.success("Ticket record deleted successfully with Admin authorization.");
      setIsAdminAuthModalOpen(false);
      navigate('/dashboard');
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Authorization failed. Unable to delete ticket.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStage2Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm(e.target as HTMLFormElement)) {
      toast.error('Please fix the errors in the form before submitting');
      return;
    }

    if (stage2Data.rescheduled_departure_date && stage2Data.departure_date && stage2Data.rescheduled_departure_date < stage2Data.departure_date) {
      toast.error('Rescheduled Departure Date cannot be before original Departure Date');
      return;
    }
    
    if (stage2Data.rescheduled_arrival_date && stage2Data.rescheduled_departure_date && stage2Data.rescheduled_arrival_date < stage2Data.rescheduled_departure_date) {
      toast.error('Rescheduled Arrival Date cannot be before Rescheduled Departure Date');
      return;
    }

    setSavingStage2(true);
    try {
      await api.put(`/tickets/${id}/stage2`, stage2Data);
      toast.success('Stage 2 updated successfully');
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to update Stage 2');
    } finally {
      setSavingStage2(false);
    }
  };

  const handleStage3Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm(e.target as HTMLFormElement)) {
      toast.error('Please fix the errors in the form before submitting');
      return;
    }
    setSavingStage3(true);
    try {
      await api.put(`/tickets/${id}/stage3`, stage3Data);
      toast.success('Stage 3 updated successfully');
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to update Stage 3');
    } finally {
      setSavingStage3(false);
    }
  };

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

  const openPaymentModal = () => {
    if (!ticketData) return;
    setPaymentForm({
      payment_date: parseInitialPaymentDate(ticketData.payment_date),
      payment_invoice_numbers: ticketData.payment_invoice_numbers || '',
      travel_agent: ticketData.travel_agent || ''
    });
    setIsPaymentModalOpen(true);
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPayment(true);
    try {
      await api.put(`/tickets/${id}/payment-status`, {
        po_status: 'payment done',
        payment_date: paymentForm.payment_date,
        payment_invoice_numbers: paymentForm.payment_invoice_numbers,
        travel_agent: paymentForm.travel_agent
      });
      toast.success('Payment details updated successfully');
      setIsPaymentModalOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to update payment status');
    } finally {
      setSavingPayment(false);
    }
  };

  const handleDocumentLinkSave = async (field: 'first_atbf' | 'first_invoice' | 'other_invoice', link: string) => {
    try {
      if (!link.startsWith('http')) {
        toast.error('Please enter a valid URL starting with http:// or https://');
        return;
      }
      await api.put(`/tickets/${id}/documents`, { [field]: link });
      toast.success(`${field.toUpperCase().replace('_', ' ')} link updated successfully`);
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update document link');
    }
  };

  const handleDocumentDelete = async (field: 'first_atbf' | 'first_invoice' | 'other_invoice') => {
    if (!window.confirm(`Are you sure you want to remove this attached ${field.toUpperCase().replace('_', ' ')}?`)) return;
    try {
      const payload: any = { [field]: '' };
      if (field === 'first_invoice') {
        payload.first_invoice_number = '';
        setFirstInvoiceNo('');
      } else if (field === 'other_invoice') {
        payload.other_invoice_number = '';
        setOtherInvoiceNo('');
      }
      await api.put(`/tickets/${id}/documents`, payload);
      toast.success(`${field.toUpperCase().replace('_', ' ')} removed`);
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to remove document');
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

  const saveInvoiceNumber = async (field: 'first_invoice_number' | 'other_invoice_number', value: string) => {
    try {
      await api.put(`/tickets/${id}/documents`, { [field]: value });
      toast.success('Invoice number saved successfully');
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save invoice number');
    }
  };

  const handleAdditionalDocumentLinkSave = async (link: string) => {
    try {
      if (!link.startsWith('http')) {
        toast.error('Please enter a valid URL starting with http:// or https://');
        return;
      }
      const currentLinks = ticketData.attached_links || [];
      const updatedLinks = [...currentLinks, link];
      await api.put(`/tickets/${id}/documents`, { attached_links: updatedLinks });
      toast.success('Additional link added successfully');
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to add link');
    }
  };

  const handleAdditionalDocumentDelete = async (idx: number) => {
    if (!window.confirm('Are you sure you want to remove this attached link?')) return;
    try {
      const currentLinks = ticketData.attached_links || [];
      const updatedLinks = currentLinks.filter((_: any, i: number) => i !== idx);
      await api.put(`/tickets/${id}/documents`, { attached_links: updatedLinks });
      toast.success('Link removed');
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to remove link');
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-50 px-4 sm:px-6 lg:px-8 py-8 max-w-7xl mx-auto">
      <div className="flex justify-start mb-4">
        <div className="h-6 w-32 bg-slate-200 rounded animate-pulse" />
      </div>
      <div className="flex justify-between items-center mb-6">
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
        <div className="h-8 w-24 bg-slate-200 rounded animate-pulse" />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 h-96 animate-pulse mb-8" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-xl border border-slate-200 h-64 animate-pulse" />
        <div className="bg-white rounded-xl border border-slate-200 h-64 animate-pulse" />
      </div>
    </div>
  );
  if (!ticketData) return null;

  const hasPoAssigned = !!(ticketData?.po_number && ticketData.po_number.trim());
  const isLocked = hasPoAssigned || ticketData.po_status === 'payment done';
  const canEditStage2 = (role === 'ADMIN1' || role === 'ADMIN') && ticketData.stage1_completed;
  const canEditStage3 = (role === 'FINANCE' || role === 'ADMIN') && ticketData.stage2_completed && ticketData.flight_status !== 'PENDING' && !ticketData.stage3_completed;
  const today = format(new Date(), 'yyyy-MM-dd');
  const hasDeparturePassed = stage2Data.departure_date ? stage2Data.departure_date <= today : false;
  const hasRescheduledDeparturePassed = stage2Data.rescheduled_departure_date ? stage2Data.rescheduled_departure_date <= today : false;

  const handleStage2Change = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    handleValidationChange(e);
    const { name, value } = e.target;
    if (name === 'flight_status') {
      setStage2Data(prev => {
        if (prev.flight_status !== value) {
          setFormFlightStatusHighlight(true);
          setTimeout(() => setFormFlightStatusHighlight(false), 3500);
        }
        return { ...prev, [name]: value };
      });
    } else if (name === 'rescheduled_flight_status') {
      setStage2Data(prev => {
        if (prev.rescheduled_flight_status !== value) {
          setFormRescheduledFlightStatusHighlight(true);
          setTimeout(() => setFormRescheduledFlightStatusHighlight(false), 3500);
        }
        return { ...prev, [name]: value };
      });
    } else {
      setStage2Data(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleStage3Change = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    handleValidationChange(e);
    setStage3Data(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const getFilteredOptions = (category: string) => (Array.isArray(options) ? options.filter(o => o.category === category) : []);
  
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-12">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        <div className="lg:col-span-3 mb-2 flex items-center justify-between">
          <div className="flex items-center">
            <Link to="/dashboard" className="text-slate-500 hover:text-slate-800 mr-4 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500 rounded p-1" aria-label="Back to dashboard">
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </Link>
            <h1 className="text-2xl font-bold text-slate-800 mr-4">Ticket Details</h1>
            <span className={`px-3 py-1 bg-sky-100 text-sky-800 font-semibold rounded-full text-xs border border-sky-200 uppercase tracking-wide`}>
              {ticketData.status}
            </span>
          </div>
          {['ADMIN', 'ADMIN1'].includes(role) && !isLocked && (
            <button
              id="btn-delete-ticket"
              type="button"
              onClick={handleDeleteTicket}
              className="inline-flex items-center px-3.5 py-1.5 border border-red-200 hover:border-red-300 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <Trash2 className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Delete Ticket Record
            </button>
          )}
        </div>

        {isLocked && (
          <div id="locked-ticket-banner" className="lg:col-span-3 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 shadow-sm">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-lg shrink-0">
              <Lock className="h-5 w-5 animate-pulse text-amber-600" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-amber-900 flex items-center gap-2">
                Ticket Editing Locked &amp; Secured
              </h3>
              <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                This ticket is locked because a <strong>PO Number ({ticketData.po_number || 'Assigned'})</strong> has been assigned. 
                Editing capabilities for Administrative Requirements, Flight Updates (Stage 2), and Attached Booking/Invoice Files have been fully locked. 
                Only payment updates are editable.
              </p>
            </div>
          </div>
        )}

        <div className="lg:col-span-2 space-y-6">
          {/* Stage 1 & 2: Ticket Requirements */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 relative">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-lg font-bold text-slate-800 flex items-center flex-wrap gap-2">
                <div className="flex items-center">
                  <span className="bg-blue-100 text-blue-800 h-6 w-6 rounded-full flex items-center justify-center text-xs mr-2">1</span>
                  Admin 1 Entry — Ticket Requirements
                </div>
                {ticketData.stage2_completed && <span className="text-sm font-normal text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Completed</span>}
                {isLocked && <span className="text-sm font-normal text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 inline-flex items-center gap-1">🔒 Locked (PO Assigned)</span>}
              </h2>
              {(role === 'ADMIN1' || role === 'ADMIN') && !isLocked && (
                <button
                  type="button"
                  onClick={() => setIsEditStage1ModalOpen(true)}
                  className="inline-flex items-center text-sm font-medium text-sky-600 hover:text-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-500 rounded p-1"
                >
                  <Edit className="h-4 w-4 mr-1" /> Edit
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div><span className="block text-slate-500">Passenger:</span> <span className="font-medium">{ticketData.passenger_name}</span></div>
              <div><span className="block text-slate-500">Passport:</span> <span className="font-medium">{ticketData.pp_number}</span></div>
              <div><span className="block text-slate-500">Job Category:</span> <span className="font-medium">{ticketData.job_category || '-'}</span></div>
              <div><span className="block text-slate-500">Ticket Type:</span> <span className="font-medium">{ticketData.ticket_type}</span></div>
              <div><span className="block text-slate-500">Re; company:</span> <span className="font-medium">{ticketData.company || '-'}</span></div>
              <div>
                <span className="block text-slate-500">Sub-contractor Entitlement:</span> 
                <span className={`inline-flex items-center px-2 py-0.5 mt-0.5 rounded-full text-xs font-semibold ${
                  ticketData.subcontractor_entitlement_applied 
                    ? 'bg-sky-100 text-sky-800 border border-sky-200' 
                    : 'bg-slate-100 text-slate-600'
                }`}>
                  {ticketData.subcontractor_entitlement_applied ? 'Yes (Applied ✓)' : 'Not Applied'}
                </span>
              </div>
              <div>
                <span className="block text-slate-500">Project(s):</span>
                <span className="font-medium">
                  {Array.isArray(ticketData?.project_ids) && ticketData.project_ids.length > 0
                    ? ticketData.project_ids.map((id: string) => projects.find(p => p.id === id)?.name || id).join(', ')
                    : (projects.find(p => p.id === ticketData.project_id)?.name || ticketData.project_id || '-')}
                </span>
              </div>
              <div><span className="block text-slate-500">Route:</span> <span className="font-medium">{ticketData.route || '-'}</span></div>
              <div><span className="block text-slate-500">Arranged Date:</span> <span className="font-medium">{ticketData.ticket_arranged_date || '-'}</span></div>
              <div><span className="block text-slate-500">Travel Agent:</span> <span className="font-medium">{ticketData.travel_agent || '-'}</span></div>
              <div><span className="block text-slate-500">Departure Date:</span> <span className="font-medium">{ticketData.departure_date || '-'}</span></div>
              <div><span className="block text-slate-500">Actual Arrival Date:</span> <span className="font-medium">{ticketData.arrival_date || '-'}</span></div>
              <div>
                <span className="block text-slate-500 mb-0.5">Flight Status:</span> 
                <motion.span
                  animate={highlightFlightStatus ? {
                    scale: [1, 1.12, 1.12, 1],
                    backgroundColor: [
                      "rgba(241, 245, 249, 0)",
                      ticketData.flight_status === 'NO_SHOW' ? "rgba(239, 68, 68, 0.25)" : "rgba(14, 165, 233, 0.25)",
                      ticketData.flight_status === 'NO_SHOW' ? "rgba(239, 68, 68, 0.15)" : "rgba(14, 165, 233, 0.15)",
                      "rgba(241, 245, 249, 0)"
                    ],
                    borderColor: [
                      "rgba(226, 232, 240, 0)",
                      ticketData.flight_status === 'NO_SHOW' ? "rgba(239, 68, 68, 0.5)" : "rgba(14, 165, 233, 0.5)",
                      ticketData.flight_status === 'NO_SHOW' ? "rgba(239, 68, 68, 0.25)" : "rgba(14, 165, 233, 0.25)",
                      "rgba(226, 232, 240, 0)"
                    ],
                    paddingLeft: ["0px", "8px", "8px", "0px"],
                    paddingRight: ["0px", "8px", "8px", "0px"],
                    paddingTop: ["0px", "4px", "4px", "0px"],
                    paddingBottom: ["0px", "4px", "4px", "0px"],
                  } : {}}
                  transition={{ duration: 2.5, ease: "easeInOut" }}
                  className={`inline-flex items-center font-extrabold text-xs uppercase tracking-wider rounded-lg border transition-all duration-300 ${
                    ticketData.flight_status === 'NO_SHOW' 
                      ? 'text-red-600 bg-red-50 px-2.5 py-1 border-red-200 shadow-sm'
                      : ticketData.flight_status === 'DEPARTED'
                        ? 'text-emerald-700 bg-emerald-50 px-2.5 py-1 border-emerald-200 shadow-sm'
                        : 'text-slate-800 bg-slate-100 px-2.5 py-1 border-slate-200 shadow-2xs'
                  }`}
                >
                  {ticketData.flight_status === 'NO_SHOW' && <span className="mr-1 animate-bounce">⚠️</span>}
                  {ticketData.flight_status === 'DEPARTED' && <span className="mr-1 animate-pulse">✈️</span>}
                  {ticketData.flight_status || '-'}
                </motion.span>
              </div>
              <div className="md:col-span-3 mt-2 border-t pt-4 border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <span><span className="text-slate-500">Approved Cost:</span> <span className="font-medium ml-1">{ticketData.approved_rate} {ticketData.currency}</span></span>
                </div>
                {['NO_SHOW', 'CANCELLED', 'RESCHEDULED'].includes(ticketData.flight_status) && (ticketData.rescheduled_departure_date || ticketData.rescheduled_ticket_amount) && (
                  <div className="mb-4 bg-orange-50 p-3 rounded-xl border border-orange-200/85 grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                    <div><span className="block text-orange-800/70 text-xs">2nd Ticket Dep. Date</span> <span className="font-medium text-orange-900">{ticketData.rescheduled_departure_date || '-'}</span></div>
                    <div><span className="block text-orange-800/70 text-xs">2nd Ticket Issued</span> <span className="font-medium text-orange-900">{ticketData.rescheduled_ticket_date || '-'}</span></div>
                    <div><span className="block text-orange-800/70 text-xs">2nd Ticket Amount</span> <span className="font-medium text-orange-900">{ticketData.rescheduled_ticket_amount || '-'}</span></div>
                    <div><span className="block text-orange-800/70 text-xs">2nd Ticket Agent</span> <span className="font-medium text-orange-900">{ticketData.rescheduled_ticket_agent || '-'}</span></div>
                    <div>
                      <span className="block text-orange-800/70 text-xs mb-0.5">2nd Flight Status</span> 
                      <motion.span
                        animate={highlightRescheduledFlightStatus ? {
                          scale: [1, 1.12, 1.12, 1],
                          backgroundColor: [
                            "rgba(251, 243, 219, 0)",
                            ticketData.rescheduled_flight_status === 'NO_SHOW' ? "rgba(239, 68, 68, 0.25)" : "rgba(249, 115, 22, 0.25)",
                            ticketData.rescheduled_flight_status === 'NO_SHOW' ? "rgba(239, 68, 68, 0.15)" : "rgba(249, 115, 22, 0.15)",
                            "rgba(251, 243, 219, 0)"
                          ],
                          borderColor: [
                            "rgba(253, 230, 138, 0)",
                            ticketData.rescheduled_flight_status === 'NO_SHOW' ? "rgba(239, 68, 68, 0.5)" : "rgba(249, 115, 22, 0.5)",
                            ticketData.rescheduled_flight_status === 'NO_SHOW' ? "rgba(239, 68, 68, 0.25)" : "rgba(249, 115, 22, 0.25)",
                            "rgba(253, 230, 138, 0)"
                          ],
                          paddingLeft: ["0px", "6px", "6px", "0px"],
                          paddingRight: ["0px", "6px", "6px", "0px"],
                          paddingTop: ["0px", "3px", "3px", "0px"],
                          paddingBottom: ["0px", "3px", "3px", "0px"],
                        } : {}}
                        transition={{ duration: 2.5, ease: "easeInOut" }}
                        className={`inline-flex items-center font-extrabold text-[11px] uppercase tracking-wider rounded border transition-all duration-300 ${
                          ticketData.rescheduled_flight_status === 'NO_SHOW'
                            ? 'text-red-650 bg-red-100/50 px-2 py-0.5 border-red-200 shadow-sm'
                            : ticketData.rescheduled_flight_status === 'DEPARTED'
                              ? 'text-emerald-700 bg-emerald-100/50 px-2 py-0.5 border-emerald-200 shadow-sm'
                              : 'text-orange-900 bg-orange-100/60 px-2 py-0.5 border-orange-200 shadow-2xs'
                        }`}
                      >
                        {ticketData.rescheduled_flight_status || '-'}
                      </motion.span>
                    </div>
                  </div>
                )}
                {canEditStage2 && (
                  <form onSubmit={handleStage2Submit} className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <h3 className="text-sm font-semibold text-slate-800 mb-3">Agent Flight Update (Stage 2)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Departure Date</label>
                        <input name="departure_date" type="date" value={stage2Data.departure_date} onChange={handleStage2Change} onBlur={handleBlur} disabled={isLocked} className={`w-full px-2 py-1.5 text-sm border ${errors.departure_date ? 'border-red-500' : 'border-slate-300'} rounded focus:ring-1 focus:ring-sky-500 outline-none disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed`} required />
                        <FieldError error={errors.departure_date} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Actual Arrival Date</label>
                        <input name="arrival_date" type="date" value={stage2Data.arrival_date} onChange={handleStage2Change} onBlur={handleBlur} disabled={isLocked || ((!hasDeparturePassed || stage2Data.flight_status !== 'DEPARTED') && role !== 'ADMIN' && role !== 'ADMIN1')} className={`w-full px-2 py-1.5 text-sm border ${errors.arrival_date ? 'border-red-500' : 'border-slate-300'} rounded focus:ring-1 focus:ring-sky-500 outline-none disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed`} required={stage2Data.flight_status === 'DEPARTED'} />
                        <FieldError error={errors.arrival_date} />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-slate-700">Flight Status</label>
                          {formFlightStatusHighlight && (
                            <motion.span 
                              initial={{ opacity: 0, x: -5, scale: 0.9 }}
                              animate={{ opacity: [0, 1, 1, 0], x: [0, 0, 0, 5], scale: [0.9, 1, 1, 0.95] }}
                              transition={{ duration: 3.5, times: [0, 0.1, 0.9, 1] }}
                              className="text-[10pt] text-sky-600 font-extrabold uppercase tracking-wide select-none"
                            >
                              Staged ✓
                            </motion.span>
                          )}
                        </div>
                        <select 
                          name="flight_status" 
                          value={stage2Data.flight_status} 
                          onChange={handleStage2Change} 
                          onBlur={handleBlur} 
                          disabled={isLocked || hasSecondTicket || (!hasDeparturePassed && role !== 'ADMIN' && role !== 'ADMIN1')} 
                          className={`w-full px-2 py-1.5 text-sm border transition-all duration-300 ${
                            formFlightStatusHighlight 
                              ? 'ring-2 ring-sky-500/80 border-sky-500 bg-sky-500/5 shadow-xs scale-[1.01]' 
                              : errors.flight_status 
                                ? 'border-red-500' 
                                : 'border-brand-border-strong'
                          } rounded focus:ring-1 focus:ring-brand-accent outline-none bg-brand-surface text-brand-text-strong disabled:bg-brand-bg-elevated disabled:text-brand-text-muted disabled:cursor-not-allowed`}
                        >
                          <option value="PENDING">PENDING</option>
                          <option value="DEPARTED">DEPARTED</option>
                          <option value="NO_SHOW">NO SHOW</option>
                          <option value="RESCHEDULED">RESCHEDULED</option>
                          <option value="CANCELLED">CANCELLED</option>
                        </select>
                      </div>
                    </div>
                    {!hasDeparturePassed && (
                      <p className="mt-2 text-xs text-orange-600">Flight Status and Actual Arrival Date can be updated after the departure date.</p>
                    )}

                    {['NO_SHOW', 'CANCELLED', 'RESCHEDULED'].includes(stage2Data.flight_status) && (
                      <div className="mt-4 p-4 border border-orange-300 rounded-xl shadow-lg bg-orange-500/5 animate-flash-grow">
                        <h4 className="text-sm font-extrabold uppercase tracking-widest mb-3 border-b border-orange-200 pb-1.5" style={{ color: '#d84315' }}>
                          Re-booking / Cancellation Details
                        </h4>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <div className="bg-white p-3 rounded border border-orange-200">
                            <span className="block text-xs uppercase font-bold" style={{ color: '#c2410c' }}>Date of first scheduled flight</span>
                            <span className="font-bold text-sm" style={{ color: '#000000' }}>{ticketData.departure_date || '-'}</span>
                          </div>
                          <div className="bg-white p-3 rounded border border-orange-200">
                            <span className="block text-xs uppercase font-bold" style={{ color: '#c2410c' }}>Date (1st ticket) ISSUED</span>
                            <span className="font-bold text-sm" style={{ color: '#000000' }}>{ticketData.ticket_arranged_date || '-'}</span>
                          </div>
                          <div className="bg-white p-3 rounded border border-orange-200">
                            <span className="block text-xs uppercase font-bold" style={{ color: '#c2410c' }}>1st ticket amount</span>
                            <span className="font-bold text-sm" style={{ color: '#000000' }}>{ticketData.approved_rate} {ticketData.currency}</span>
                          </div>
                          <div className="bg-white p-3 rounded border border-orange-200">
                            <span className="block text-xs uppercase font-bold" style={{ color: '#c2410c' }}>1st ticket agent</span>
                            <span className="font-bold text-sm" style={{ color: '#000000' }}>{ticketData.travel_agent || '-'}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div>
                            <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#c2410c' }}>2nd Ticket Dep. Date *</label>
                            <input name="rescheduled_departure_date" required type="date" value={stage2Data.rescheduled_departure_date} onChange={handleStage2Change} onBlur={handleBlur} disabled={isLocked} className={`w-full px-2 py-1.5 text-sm border ${errors.rescheduled_departure_date ? 'border-red-500' : 'border-orange-300'} rounded focus:ring-1 focus:ring-orange-500 outline-none font-semibold disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed`} style={{ color: '#000000', backgroundColor: isLocked ? '#f1f5f9' : '#ffffff' }} />
                            <FieldError error={errors.rescheduled_departure_date} />
                          </div>
                          <div>
                            <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#c2410c' }}>2nd Ticket Issued *</label>
                            <input name="rescheduled_ticket_date" required type="date" value={stage2Data.rescheduled_ticket_date} onChange={handleStage2Change} onBlur={handleBlur} disabled={isLocked} className={`w-full px-2 py-1.5 text-sm border ${errors.rescheduled_ticket_date ? 'border-red-500' : 'border-orange-300'} rounded focus:ring-1 focus:ring-orange-500 outline-none font-semibold disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed`} style={{ color: '#000000', backgroundColor: isLocked ? '#f1f5f9' : '#ffffff' }} />
                            <FieldError error={errors.rescheduled_ticket_date} />
                          </div>
                          <div>
                            <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#c2410c' }}>2nd Ticket Amount</label>
                            <input name="rescheduled_ticket_amount" type="number" step="0.01" value={stage2Data.rescheduled_ticket_amount} onChange={handleStage2Change} onBlur={handleBlur} disabled={isLocked} className={`w-full px-2 py-1.5 text-sm border ${errors.rescheduled_ticket_amount ? 'border-red-500' : 'border-orange-300'} rounded focus:ring-1 focus:ring-orange-500 outline-none font-semibold disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed`} style={{ color: '#000000', backgroundColor: isLocked ? '#f1f5f9' : '#ffffff' }} />
                            <FieldError error={errors.rescheduled_ticket_amount} />
                          </div>
                          <div>
                            <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#c2410c' }}>2nd Ticket Agent</label>
                            {isAddingNewAgent ? (
                              <div className="flex gap-2">
                                <input autoFocus type="text" value={newAgentName} onChange={e => setNewAgentName(e.target.value)} disabled={isLocked} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-1 focus:ring-sky-500 outline-none text-black bg-white font-semibold disabled:bg-slate-100 disabled:text-slate-500" style={{ color: '#000000', backgroundColor: isLocked ? '#f1f5f9' : '#ffffff' }} placeholder="New agent..." />
                                <button type="button" disabled={isLocked} onClick={async () => {
                                  if (!newAgentName.trim()) return;
                                  try {
                                    const res = await api.post('/options', { category: 'TRAVEL_AGENT', value: newAgentName.trim() });
                                    toast.success('Agent added');
                                    setOptions(prev => [...prev, res.data]);
                                    setStage2Data(prev => ({ ...prev, rescheduled_ticket_agent: newAgentName.trim() }));
                                    setIsAddingNewAgent(false);
                                    setNewAgentName('');
                                  } catch (error: any) {
                                    toast.error('Failed to add agent');
                                  }
                                }} className="px-2 bg-sky-600 text-white rounded text-xs hover:bg-sky-700 disabled:opacity-50">Add</button>
                                <button type="button" onClick={() => setIsAddingNewAgent(false)} className="px-2 bg-slate-200 text-slate-700 rounded text-xs hover:bg-slate-300">Cancel</button>
                              </div>
                            ) : (
                              <>
                              <select name="rescheduled_ticket_agent" value={stage2Data.rescheduled_ticket_agent} onBlur={handleBlur} disabled={isLocked} onChange={(e) => {
                                if (e.target.value === 'ADD_NEW') setIsAddingNewAgent(true);
                                else handleStage2Change(e);
                              }} className={`w-full px-2 py-1.5 text-sm border ${errors.rescheduled_ticket_agent ? 'border-red-500' : 'border-orange-300'} rounded focus:ring-1 focus:ring-orange-500 outline-none font-semibold disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed`} style={{ color: '#000000', backgroundColor: isLocked ? '#f1f5f9' : '#ffffff' }}>
                                <option value="" style={{ color: '#000000' }}>Select...</option>
                                {getFilteredOptions('TRAVEL_AGENT').map(o => (
                                  <option key={o.id} value={o.value} style={{ color: '#000000' }}>{o.value}</option>
                                ))}
                                <option value="ADD_NEW" className="font-bold text-sky-600 border-t border-slate-200" style={{ color: '#0284c7' }}>+ Add New Agent</option>
                              </select>
                              <FieldError error={errors.rescheduled_ticket_agent} />
                              </>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4 border-t border-orange-100 pt-3">
                          <div>
                            <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#c2410c' }}>2nd Ticket Actual Arrival Date</label>
                            <input name="rescheduled_arrival_date" type="date" value={stage2Data.rescheduled_arrival_date || ''} onChange={handleStage2Change} onBlur={handleBlur} disabled={isLocked || ((!hasRescheduledDeparturePassed || stage2Data.rescheduled_flight_status !== 'DEPARTED') && role !== 'ADMIN' && role !== 'ADMIN1')} required={stage2Data.rescheduled_flight_status === 'DEPARTED'} className={`w-full px-2 py-1.5 text-sm border ${errors.rescheduled_arrival_date ? 'border-red-500' : 'border-orange-300'} rounded focus:ring-1 focus:ring-orange-500 outline-none font-semibold disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed`} style={{ color: '#000000', backgroundColor: (isLocked || (!hasRescheduledDeparturePassed || stage2Data.rescheduled_flight_status !== 'DEPARTED') && role !== 'ADMIN' && role !== 'ADMIN1') ? '#e2e8f0' : '#ffffff' }} />
                            <FieldError error={errors.rescheduled_arrival_date} />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-xs font-bold uppercase tracking-wider" style={{ color: '#c2410c' }}>2nd Flight Status</label>
                              {formRescheduledFlightStatusHighlight && (
                                <motion.span 
                                  initial={{ opacity: 0, x: -5, scale: 0.9 }}
                                  animate={{ opacity: [0, 1, 1, 0], x: [0, 0, 0, 5], scale: [0.9, 1, 1, 0.95] }}
                                  transition={{ duration: 3.5, times: [0, 0.1, 0.9, 1] }}
                                  className="text-[10pt] text-orange-600 font-extrabold uppercase tracking-wide select-none"
                                >
                                  Staged ✓
                                </motion.span>
                              )}
                            </div>
                            <select 
                              name="rescheduled_flight_status" 
                              value={stage2Data.rescheduled_flight_status || 'PENDING'} 
                              onChange={handleStage2Change} 
                              onBlur={handleBlur}
                              disabled={isLocked || (!hasRescheduledDeparturePassed && role !== 'ADMIN' && role !== 'ADMIN1')}
                              className={`w-full px-2 py-1.5 text-sm border transition-all duration-300 ${
                                formRescheduledFlightStatusHighlight 
                                  ? 'ring-2 ring-orange-500/80 border-orange-500 bg-orange-500/5 shadow-xs scale-[1.01]' 
                                  : errors.rescheduled_flight_status 
                                    ? 'border-red-500' 
                                    : 'border-orange-300'
                              } rounded focus:ring-1 focus:ring-orange-500 outline-none font-semibold text-black bg-white`} 
                              style={{ color: '#000000', backgroundColor: '#ffffff' }}
                            >
                              <option value="PENDING" style={{ color: '#000000' }}>PENDING</option>
                              <option value="DEPARTED" style={{ color: '#000000' }}>DEPARTED</option>
                              <option value="NO_SHOW" style={{ color: '#000000' }}>NO SHOW</option>
                              <option value="RESCHEDULED" style={{ color: '#000000' }}>RESCHEDULED</option>
                              <option value="CANCELLED" style={{ color: '#000000' }}>CANCELLED</option>
                            </select>
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#c2410c' }}>
                              2nd Attempt Invoice *
                            </label>
                            {ticketData.other_invoice ? (
                              <div className="bg-white p-2 border border-orange-200 rounded flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  {isPdfUrl(ticketData.other_invoice) ? (
                                    <div className="w-8 h-8 rounded bg-red-50 flex items-center justify-center border border-red-200 shrink-0 select-none">
                                      <span className="text-[9px] font-extrabold text-red-600">PDF</span>
                                    </div>
                                  ) : (
                                    <img src={ticketData.other_invoice} alt="Invoice preview" className="w-8 h-8 object-cover rounded border border-slate-200 shrink-0" />
                                  )}
                                  <div className="text-xs">
                                    <span className="font-semibold text-emerald-600 block text-[11px]">Attached ✓</span>
                                    <input 
                                      type="text" 
                                      disabled={isLocked}
                                      placeholder="Invoice Reference" 
                                      value={otherInvoiceNo} 
                                      onChange={(e) => setOtherInvoiceNo(e.target.value)} 
                                      onBlur={() => saveInvoiceNumber('other_invoice_number', otherInvoiceNo)} 
                                      className="mt-0.5 text-[11px] p-1 border border-slate-200 rounded font-mono font-medium focus:border-orange-500 outline-none w-28 bg-white text-black disabled:bg-slate-100 disabled:text-slate-500" 
                                    />
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  {!isLocked && (
                                    <>
                                      <button 
                                        type="button" 
                                        onClick={() => handleDocumentDelete('other_invoice')} 
                                        className="text-[10px] bg-red-50 hover:bg-red-100 text-red-600 font-semibold px-2 py-1 rounded border border-red-100 cursor-pointer"
                                      >
                                        Remove
                                      </button>
                                      <button 
                                        type="button" 
                                        onClick={() => saveInvoiceNumber('other_invoice_number', otherInvoiceNo)} 
                                        className="text-[10px] bg-emerald-50 hover:bg-emerald-100 text-emerald-600 font-semibold px-2 py-1 rounded border border-emerald-100 cursor-pointer"
                                      >
                                        Save
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="w-full">
                                <input
                                  type="url"
                                  disabled={isLocked}
                                  placeholder={isLocked ? "Locked (PO Assigned)" : "Enter Share Point Link..."}
                                  className="w-full text-xs p-2 border border-orange-300 rounded focus:border-orange-500 outline-none font-medium text-black bg-white disabled:bg-slate-100 disabled:text-slate-400"
                                  onBlur={(e) => {
                                    if (e.target.value) {
                                      handleDocumentLinkSave('other_invoice', e.target.value);
                                      e.target.value = '';
                                    }
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="flex justify-end mt-3 items-center gap-2">
                      {isLocked ? (
                        <span className="text-xs text-amber-600 font-semibold bg-amber-50 px-2.5 py-1.5 rounded border border-amber-200 inline-flex items-center gap-1">
                          🔒 Stage 2 Locked (PO Assigned)
                        </span>
                      ) : (
                        <button type="submit" disabled={savingStage2} className="inline-flex items-center px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium rounded disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1">
                          <Save className="h-3 w-3 mr-1" aria-hidden="true" /> {savingStage2 ? 'Saving...' : 'Update Details'}
                        </button>
                      )}
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>

          {/* Document Verification & Attachments (ATBF and Invoices) */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-2 flex items-center">
              <Paperclip className="w-5 h-5 mr-2 text-slate-500" />
              Attached Booking & Invoice Files
            </h2>
            <p className="text-sm text-slate-500 mb-6 font-normal">
              According to guidelines, an <strong>ATBF and Invoice</strong> must be attached for the <strong>first booking attempt</strong>, and an <strong>Invoice</strong> for <strong>subsequent attempts</strong>.
            </p>

            <div className="space-y-6">
              {/* First Attempt Row */}
              <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center justify-between">
                  <span>First Flying Attempt (Original)</span>
                  <span className="bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border border-blue-100 uppercase tracking-widest font-sans">
                    ATBF & Invoice required
                  </span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* ATBF */}
                  <div className="bg-white p-4 rounded-lg border border-slate-100 shadow-sm flex flex-col justify-between min-h-[140px]">
                    <div>
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="text-sm font-semibold text-slate-900">Air Ticket Booking Form (ATBF)</h4>
                          <p className="text-xs text-slate-400 mt-0.5">Original authorization document</p>
                        </div>
                        <FileText className={`w-5 h-5 ${ticketData.first_atbf ? 'text-sky-500' : 'text-slate-300'}`} />
                      </div>
                      
                      {ticketData.first_atbf ? (
                        <div className="mt-3 flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => setLightboxImage(ticketData.first_atbf)}
                            className="relative group w-12 h-12 rounded-lg border border-slate-200 overflow-hidden shadow-sm hover:scale-105 cursor-pointer transition-transform bg-slate-50 text-left flex items-center justify-center"
                            title="Preview ATBF"
                          >
                            {isPdfUrl(ticketData.first_atbf) ? (
                              <div className="w-full h-full bg-red-500/10 flex flex-col items-center justify-center p-0.5">
                                <FileText className="w-6 h-6 text-red-500" />
                                <span className="text-[8px] font-extrabold text-red-600 uppercase">PDF</span>
                              </div>
                            ) : isWebUrl(ticketData.first_atbf) ? (
                              <div className="w-full h-full bg-sky-500/10 flex flex-col items-center justify-center p-0.5">
                                <FileText className="w-6 h-6 text-sky-500" />
                                <span className="text-[8px] font-extrabold text-sky-600 uppercase">LINK</span>
                              </div>
                            ) : (
                              <img src={ticketData.first_atbf} alt="ATBF Scan" className="w-full h-full object-cover" />
                            )}
                          </button>
                          <div className="text-xs">
                            <span className="text-emerald-600 font-semibold block">Attached ✓</span>
                            <span className="text-slate-400">Click preview to view</span>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 text-xs italic text-slate-400 flex items-center">
                          <AlertCircle className="w-4 h-4 mr-1 text-slate-400/80" /> None attached
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                      {ticketData.first_atbf ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleDownloadFile(ticketData.first_atbf, `ATBF_${ticketData.passenger_name.replace(/\s+/g, '_')}.png`)}
                            className="inline-flex items-center text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5 mr-1" /> Download
                          </button>
                          {['ADMIN', 'ADMIN1', 'FINANCE'].includes(role) && !isLocked && (
                            <button
                              type="button"
                              onClick={() => handleDocumentDelete('first_atbf')}
                              className="inline-flex items-center text-xs font-semibold text-red-500 hover:text-red-700 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                            </button>
                          )}
                        </>
                      ) : (
                        ['ADMIN', 'ADMIN1', 'FINANCE'].includes(role) && !isLocked ? (
                          <div className="w-full">
                            <input
                              type="url"
                              placeholder="Enter Share Point Link..."
                              className="w-full text-xs p-2 border border-sky-300 rounded focus:border-sky-500 outline-none font-medium text-black bg-white"
                              onBlur={(e) => {
                                if (e.target.value) {
                                  handleDocumentLinkSave('first_atbf', e.target.value);
                                }
                              }}
                            />
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 select-none">
                            {isLocked ? "Locked (PO Assigned)" : "Admin or Finance permission needed"}
                          </span>
                        )
                      )}
                    </div>
                  </div>

                  {/* Original Invoice */}
                  <div className="bg-white p-4 rounded-lg border border-slate-100 shadow-sm flex flex-col justify-between min-h-[140px]">
                    <div>
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="text-sm font-semibold text-slate-900">Attempt 1 Invoice</h4>
                          <p className="text-xs text-slate-400 mt-0.5">Original flying invoice</p>
                        </div>
                        <FileText className={`w-5 h-5 ${ticketData.first_invoice ? 'text-emerald-500' : 'text-slate-300'}`} />
                      </div>
                      
                      {ticketData.first_invoice ? (
                        <div className="mt-3 flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => setLightboxImage(ticketData.first_invoice)}
                            className="relative group w-12 h-12 rounded-lg border border-slate-200 overflow-hidden shadow-sm hover:scale-105 cursor-pointer transition-transform bg-slate-50 text-left flex items-center justify-center"
                            title="Preview Invoice"
                          >
                            {isPdfUrl(ticketData.first_invoice) ? (
                              <div className="w-full h-full bg-red-500/10 flex flex-col items-center justify-center p-0.5">
                                <FileText className="w-6 h-6 text-red-500" />
                                <span className="text-[8px] font-extrabold text-red-600 uppercase">PDF</span>
                              </div>
                            ) : isWebUrl(ticketData.first_invoice) ? (
                              <div className="w-full h-full bg-emerald-500/10 flex flex-col items-center justify-center p-0.5">
                                <FileText className="w-6 h-6 text-emerald-500" />
                                <span className="text-[8px] font-extrabold text-emerald-600 uppercase">LINK</span>
                              </div>
                            ) : (
                              <img src={ticketData.first_invoice} alt="Invoice Scan" className="w-full h-full object-cover" />
                            )}
                          </button>
                          <div className="text-xs">
                            <span className="text-emerald-600 font-semibold block">Attached ✓</span>
                            <span className="text-slate-400">Click preview to view</span>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 text-xs italic text-slate-400 flex items-center">
                          <AlertCircle className="w-4 h-4 mr-1 text-slate-400/80" /> None attached
                        </div>
                      )}

                      {ticketData.first_invoice && (
                        <div className="mt-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                          <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
                            Invoice Reference (1st Attempt)
                          </label>
                          <div className="flex items-center space-x-1 relative">
                            <input
                              type="text"
                              value={firstInvoiceNo}
                              onChange={(e) => setFirstInvoiceNo(e.target.value)}
                              onBlur={() => saveInvoiceNumber('first_invoice_number', firstInvoiceNo)}
                              placeholder={isScanningFirstInvoiceDetails ? "Scanning invoice..." : "Invoice number"}
                              disabled={isScanningFirstInvoiceDetails || isLocked}
                              className="text-xs p-1.5 border border-slate-300 rounded font-mono font-medium w-full focus:ring-1 focus:ring-emerald-500 bg-white outline-none disabled:bg-slate-100 disabled:text-slate-400"
                            />
                            {!isLocked && (
                              <button
                                type="button"
                                onClick={() => saveInvoiceNumber('first_invoice_number', firstInvoiceNo)}
                                title="Save invoice number"
                                className="p-1 px-2 text-xs bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-semibold rounded cursor-pointer flex items-center shrink-0"
                              >
                                <Save className="w-3.5 h-3.5 mr-1" /> Save
                              </button>
                            )}
                            {isScanningFirstInvoiceDetails && (
                              <div className="absolute right-20 top-2 flex items-center space-x-1 bg-white px-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-ping" />
                                <span className="text-[8px] font-bold text-sky-600 uppercase tracking-wider">Scanning...</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                      {ticketData.first_invoice ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleDownloadFile(ticketData.first_invoice, `Invoice_1_${ticketData.passenger_name.replace(/\s+/g, '_')}.png`)}
                            className="inline-flex items-center text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5 mr-1" /> Download
                          </button>
                          {['ADMIN', 'ADMIN1', 'FINANCE'].includes(role) && !isLocked && (
                            <button
                              type="button"
                              onClick={() => handleDocumentDelete('first_invoice')}
                              className="inline-flex items-center text-xs font-semibold text-red-500 hover:text-red-700 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                            </button>
                          )}
                        </>
                      ) : (
                        ['ADMIN', 'ADMIN1', 'FINANCE'].includes(role) && !isLocked ? (
                          <div className="w-full">
                            <input
                              type="url"
                              placeholder="Enter Share Point Link..."
                              className="w-full text-xs p-2 border border-emerald-300 rounded focus:border-emerald-500 outline-none font-medium text-black bg-white"
                              onBlur={(e) => {
                                if (e.target.value) {
                                  handleDocumentLinkSave('first_invoice', e.target.value);
                                }
                              }}
                            />
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 select-none">
                            {isLocked ? "Locked (PO Assigned)" : "Admin or Finance permission needed"}
                          </span>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Other Attempt Row (Invoice only) */}
              <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center justify-between">
                  <span>Other Attempt (Rescheduled Flight)</span>
                  <span className="bg-amber-50 text-amber-700 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border border-amber-100 uppercase tracking-widest font-sans">
                    Invoice required
                  </span>
                </h3>
                
                {['NO_SHOW', 'CANCELLED', 'RESCHEDULED'].includes(ticketData.flight_status) ? (
                  <div className="bg-white p-4 rounded-lg border border-slate-100 shadow-sm flex flex-col justify-between min-h-[140px]">
                    <div>
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="text-sm font-semibold text-slate-900">Attempt 2+ Invoice</h4>
                          <p className="text-xs text-slate-400 mt-0.5">Invoice for rescheduled/refunded ticket booking</p>
                        </div>
                        <FileText className={`w-5 h-5 ${ticketData.other_invoice ? 'text-amber-500' : 'text-slate-300'}`} />
                      </div>
                      
                      {ticketData.other_invoice ? (
                        <div className="mt-3 flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => setLightboxImage(ticketData.other_invoice)}
                            className="relative group w-12 h-12 rounded-lg border border-slate-200 overflow-hidden shadow-sm hover:scale-105 cursor-pointer transition-transform bg-slate-50 text-left flex items-center justify-center"
                            title="Preview Attempt 2 Invoice"
                          >
                            {isPdfUrl(ticketData.other_invoice) ? (
                              <div className="w-full h-full bg-red-500/10 flex flex-col items-center justify-center p-0.5">
                                <FileText className="w-6 h-6 text-red-500" />
                                <span className="text-[8px] font-extrabold text-red-600 uppercase">PDF</span>
                              </div>
                            ) : isWebUrl(ticketData.other_invoice) ? (
                              <div className="w-full h-full bg-amber-500/10 flex flex-col items-center justify-center p-0.5">
                                <FileText className="w-6 h-6 text-amber-500" />
                                <span className="text-[8px] font-extrabold text-amber-600 uppercase">LINK</span>
                              </div>
                            ) : (
                              <img src={ticketData.other_invoice} alt="Rescheduled Invoice Scan" className="w-full h-full object-cover" />
                            )}
                          </button>
                          <div className="text-xs">
                            <span className="text-emerald-600 font-semibold block">Attached ✓</span>
                            <span className="text-slate-400">Click preview to view</span>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 text-xs italic text-slate-400 flex items-center">
                          <AlertCircle className="w-4 h-4 mr-1 text-slate-400/80" /> None attached
                        </div>
                      )}

                      {ticketData.other_invoice && (
                        <div className="mt-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                          <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
                            Invoice Reference (2nd Attempt)
                          </label>
                          <div className="flex items-center space-x-1 relative">
                            <input
                              type="text"
                              value={otherInvoiceNo}
                              onChange={(e) => setOtherInvoiceNo(e.target.value)}
                              onBlur={() => saveInvoiceNumber('other_invoice_number', otherInvoiceNo)}
                              placeholder={isScanningOtherInvoiceDetails ? "Scanning invoice..." : "Invoice number"}
                              disabled={isScanningOtherInvoiceDetails || hasPoAssigned}
                              className="text-xs p-1.5 border border-slate-300 rounded font-mono font-medium w-full focus:ring-1 focus:ring-amber-500 bg-white outline-none disabled:bg-slate-100 disabled:text-slate-400"
                            />
                            {!hasPoAssigned && (
                              <button
                                type="button"
                                onClick={() => saveInvoiceNumber('other_invoice_number', otherInvoiceNo)}
                                title="Save invoice number"
                                className="p-1 px-2 text-xs bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 font-semibold rounded cursor-pointer flex items-center shrink-0"
                              >
                                <Save className="w-3.5 h-3.5 mr-1" /> Save
                              </button>
                            )}
                            {isScanningOtherInvoiceDetails && (
                              <div className="absolute right-20 top-2 flex items-center space-x-1 bg-white px-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                                <span className="text-[8px] font-bold text-amber-600 uppercase tracking-wider">Scanning...</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                      {ticketData.other_invoice ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleDownloadFile(ticketData.other_invoice, `Invoice_Rescheduled_${ticketData.passenger_name.replace(/\s+/g, '_')}.png`)}
                            className="inline-flex items-center text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5 mr-1" /> Download
                          </button>
                          {['ADMIN', 'ADMIN1', 'AGENT', 'FINANCE'].includes(role) && !hasPoAssigned && (
                            <button
                              type="button"
                              onClick={() => handleDocumentDelete('other_invoice')}
                              className="inline-flex items-center text-xs font-semibold text-red-500 hover:text-red-700 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                            </button>
                          )}
                        </>
                      ) : (
                        ['ADMIN', 'ADMIN1', 'AGENT', 'FINANCE'].includes(role) && !hasPoAssigned ? (
                          <div className="w-full">
                            <input
                              type="url"
                              placeholder="Enter Share Point Link..."
                              className="w-full text-xs p-2 border border-amber-300 rounded focus:border-amber-500 outline-none font-medium text-black bg-white"
                              onBlur={(e) => {
                                if (e.target.value) {
                                  handleDocumentLinkSave('other_invoice', e.target.value);
                                }
                              }}
                            />
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 select-none">Agent, Admin or Finance permission needed</span>
                        )
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-dashed border-slate-200 p-6 rounded-lg text-center text-xs text-slate-400 select-none font-sans">
                    Other Attempt attachments are only available if the flying attempt status is <strong>NO SHOW, CANCELLED,</strong> or <strong>RESCHEDULED</strong>.
                  </div>
                )}
              </div>

              {/* Additional PDF & Image Attachments */}
              <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center justify-between">
                  <span>Additional Documents</span>
                  <span className="bg-sky-50 text-sky-700 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border border-sky-100 uppercase tracking-widest font-sans">
                    Other PDF or Image files
                  </span>
                </h3>
                
                {Array.isArray(ticketData.attached_links) && ticketData.attached_links.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4 mb-4">
                    {ticketData.attached_links.map((link: string, idx: number) => (
                      <div key={idx} className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm flex items-center justify-between">
                        <div className="flex items-center text-xs font-semibold text-sky-600 hover:text-sky-800 hover:underline">
                           <a href={link} target="_blank" rel="noopener noreferrer">Link {idx + 1}</a>
                        </div>
                        {['ADMIN', 'ADMIN1', 'AGENT', 'FINANCE'].includes(role) && !isLocked && (
                          <button
                            type="button"
                            onClick={() => handleAdditionalDocumentDelete(idx)}
                            className="inline-flex items-center text-xs font-semibold text-red-500 hover:text-red-700 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white p-6 rounded-lg border border-slate-100 shadow-sm text-center text-xs italic text-slate-400 select-none flex items-center justify-center font-sans">
                    <AlertCircle className="w-4 h-4 mr-1 text-slate-400/80" /> No additional attachments uploaded yet
                  </div>
                )}

                {['ADMIN', 'ADMIN1', 'AGENT', 'FINANCE'].includes(role) && !isLocked && (
                  <div className="mt-4 flex items-center justify-between gap-2 pt-4 border-t border-slate-100 font-sans">
                      <div className="w-full">
                        <label className="text-xs font-semibold text-slate-500 block mb-1">Attach New Link</label>
                            <input
                              type="url"
                              placeholder="Enter Share Point Link..."
                              className="w-full text-xs p-2 border border-slate-300 rounded focus:border-sky-500 outline-none font-medium text-black bg-white"
                              onBlur={(e) => {
                                if (e.target.value) {
                                  handleAdditionalDocumentLinkSave(e.target.value);
                                  e.target.value = '';
                                }
                              }}
                            />
                      </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Stage 3: Finance Entry */}
          {role !== 'ADMIN1' && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center justify-between">
                <div className="flex items-center">
                  <span className="bg-emerald-100 text-emerald-800 h-6 w-6 rounded-full flex items-center justify-center text-xs mr-2">3</span>
                  Finance ERP Entry
                  {ticketData.stage3_completed && <span className="ml-3 text-sm font-normal text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Completed</span>}
                </div>
              </h2>

              {ticketData.other_invoice_number && (
                <div className="flex border-b border-slate-200 mb-5">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveInvoiceType('first');
                      updateStage3FormData(ticketData, 'first');
                    }}
                    className={`py-2 px-4 text-sm font-bold border-b-2 transition-colors cursor-pointer select-none ${
                      activeInvoiceType === 'first'
                        ? 'border-emerald-500 text-emerald-600'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    1st Attempt Invoice ({ticketData.first_invoice_number || 'Pending'})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveInvoiceType('other');
                      updateStage3FormData(ticketData, 'other');
                    }}
                    className={`py-2 px-4 text-sm font-bold border-b-2 transition-colors cursor-pointer select-none ${
                      activeInvoiceType === 'other'
                        ? 'border-emerald-500 text-emerald-600'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    2nd Attempt Invoice ({ticketData.other_invoice_number})
                  </button>
                </div>
              )}
              
              {!canEditStage3 && (role === 'FINANCE' || role === 'ADMIN') && ticketData.flight_status === 'PENDING' && (
                 <div className="bg-yellow-50 p-4 border border-yellow-200 rounded-lg text-sm text-yellow-800 flex items-center mb-4">
                   <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0" />
                   ERP entry cannot be processed until the Flight Status is updated from PENDING.
                 </div>
              )}
              
              {canEditStage3 ? (
                <form onSubmit={handleStage3Submit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(() => {
                      const ticketProjectIds = Array.isArray(ticketData?.project_ids) && ticketData.project_ids.length > 0
                        ? ticketData.project_ids
                        : (ticketData?.project_id ? [ticketData.project_id] : []);
                      const selectedProjectsObjList = projects.filter(p => ticketProjectIds.includes(p.id));
                      const hasMultipleProjects = ticketProjectIds.length > 1;

                      if (hasMultipleProjects) {
                        return (
                          <div className="col-span-1 md:col-span-2 border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-3">
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Purchase Order Numbers per Project</label>
                            {selectedProjectsObjList.map((p, idx) => {
                              const poVal = stage3Data.project_pos?.[p.id] || '';
                              return (
                                <div key={p.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2.5 rounded-md border border-slate-100">
                                  <span className="text-sm font-medium text-slate-800 min-w-[200px]" title={p.name}>
                                    {idx + 1}. {p.name}
                                    {p.company && <span className="block text-[10px] text-slate-500 font-mono font-normal">({p.company})</span>}
                                  </span>
                                  <div className="flex-1">
                                    <input
                                      type="text"
                                      required
                                      disabled={ticketData.stage3_completed}
                                      placeholder={`Enter PO for ${p.name}`}
                                      value={poVal}
                                      onChange={(e) => {
                                        const poNo = e.target.value;
                                        setStage3Data((prev: any) => {
                                          const nextProjectPos = { ...(prev.project_pos || {}), [p.id]: poNo };
                                          const combinedPO = Object.values(nextProjectPos).filter(Boolean).join(', ');
                                          return {
                                            ...prev,
                                            project_pos: nextProjectPos,
                                            po_number: combinedPO
                                          };
                                        });
                                      }}
                                      className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-100 disabled:text-slate-500 text-sm"
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      } else {
                        return (
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">PO Number</label>
                            <input name="po_number" disabled={ticketData.stage3_completed} type="text" value={stage3Data.po_number} onChange={handleStage3Change} onBlur={handleBlur} className={`w-full p-2 border ${errors.po_number ? 'border-red-500' : 'border-slate-300'} rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-50 disabled:text-slate-500`} required />
                            <FieldError error={errors.po_number} />
                          </div>
                        );
                      }
                    })()}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">PO Date</label>
                      <input name="po_date" disabled={ticketData.stage3_completed} type="date" value={stage3Data.po_date} onChange={handleStage3Change} onBlur={handleBlur} className={`w-full p-2 border ${errors.po_date ? 'border-red-500' : 'border-slate-300'} rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-50 disabled:text-slate-500`} required />
                      <FieldError error={errors.po_date} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Invoice Number</label>
                      <input name="invoice_number" disabled={ticketData.stage3_completed} type="text" value={stage3Data.invoice_number} onChange={handleStage3Change} onBlur={handleBlur} className={`w-full p-2 border ${errors.invoice_number ? 'border-red-500' : 'border-slate-300'} rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-50 disabled:text-slate-500`} required />
                      <FieldError error={errors.invoice_number} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Invoice Date</label>
                      <input name="invoice_date" disabled={ticketData.stage3_completed} type="date" value={stage3Data.invoice_date} onChange={handleStage3Change} onBlur={handleBlur} className={`w-full p-2 border ${errors.invoice_date ? 'border-red-500' : 'border-slate-300'} rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-50 disabled:text-slate-500`} />
                      <FieldError error={errors.invoice_date} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Invoice Amount</label>
                      <input name="invoice_amount" disabled={ticketData.stage3_completed} type="number" step="0.01" value={stage3Data.invoice_amount} onChange={handleStage3Change} onBlur={handleBlur} className={`w-full p-2 border ${errors.invoice_amount ? 'border-red-500' : 'border-slate-300'} rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-50 disabled:text-slate-500`} required />
                      <FieldError error={errors.invoice_amount} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">PO Status</label>
                      <select name="po_status" disabled={ticketData.stage3_completed} value={stage3Data.po_status} onChange={handleStage3Change} onBlur={handleBlur} className={`w-full p-2 border ${errors.po_status ? 'border-red-500' : 'border-brand-border-strong'} rounded-lg focus:ring-2 focus:ring-brand-accent outline-none bg-brand-surface text-brand-text-strong disabled:bg-brand-bg-elevated disabled:text-brand-text-muted disabled:appearance-none disabled:opacity-100`}>
                        <option value="pending po approval">pending po approval</option>
                        <option value="check cannot proceed">check cannot proceed</option>
                      </select>
                      <FieldError error={errors.po_status} />
                    </div>
                    {stage3Data.po_status === 'check cannot proceed' && (
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Remarks</label>
                        <textarea
                          name="po_remarks"
                          disabled={ticketData.stage3_completed}
                          value={stage3Data.po_remarks}
                          onChange={handleStage3Change}
                          onBlur={handleBlur}
                          placeholder="Please provide reason why check cannot proceed..."
                          className={`w-full p-2 border ${errors.po_remarks ? 'border-red-500' : 'border-slate-300'} rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-50 disabled:text-slate-500 min-h-[80px]`}
                          required
                        />
                        <FieldError error={errors.po_remarks} />
                      </div>
                    )}
                  </div>
                  {!ticketData.stage3_completed && (
                    <div className="flex justify-end">
                      <button type="submit" disabled={savingStage3} className="inline-flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1">
                        <Save className="h-4 w-4 mr-1" aria-hidden="true" /> {savingStage3 ? 'Saving...' : 'Save ERP Update'}
                      </button>
                    </div>
                  )}
                </form>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-2 gap-4 text-sm">
                  {(() => {
                    const isOther = activeInvoiceType === 'other';
                    const viewPoNumber = isOther ? ticketData.other_po_number : ticketData.po_number;
                    const viewPoDate = isOther ? ticketData.other_po_date : ticketData.po_date;
                    const viewInvoiceNumber = isOther ? ticketData.other_invoice_number : (ticketData.invoice_number || ticketData.first_invoice_number);
                    const viewInvoiceDate = isOther ? ticketData.other_invoice_date : (ticketData.invoice_date || ticketData.first_invoice_date);
                    const viewInvoiceAmount = isOther ? ticketData.other_invoice_amount : ticketData.invoice_amount;
                    const viewPoStatus = isOther ? ticketData.other_po_status : ticketData.po_status;
                    const viewPoRemarks = isOther ? ticketData.other_po_remarks : ticketData.po_remarks;
                    const viewProjectPOs = isOther ? (ticketData.other_project_pos || {}) : (ticketData.project_pos || {});
                    const viewPaymentDate = isOther ? ticketData.other_payment_date : ticketData.payment_date;
                    const viewPaymentInvoiceNumbers = isOther ? ticketData.other_payment_invoice_numbers : ticketData.payment_invoice_numbers;
                    const viewTravelAgent = isOther ? ticketData.other_travel_agent : ticketData.travel_agent;

                    const ticketProjectIds = Array.isArray(ticketData?.project_ids) && ticketData.project_ids.length > 0
                      ? ticketData.project_ids
                      : (ticketData?.project_id ? [ticketData.project_id] : []);
                    const selectedProjectsObjList = projects.filter(p => ticketProjectIds.includes(p.id));
                    const hasMultipleProjects = ticketProjectIds.length > 1;

                    return (
                      <>
                        <div className="col-span-2 border border-slate-200 rounded-lg p-4 bg-white flex flex-wrap gap-2">
                          {ticketData.first_atbf && <a href={ticketData.first_atbf} target="_blank" rel="noopener noreferrer" className="px-3 py-1 bg-sky-100 text-sky-700 text-xs font-semibold rounded-full underline">View ATBF</a>}
                          {isOther ? (
                            ticketData.other_invoice && <a href={ticketData.other_invoice} target="_blank" rel="noopener noreferrer" className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-full underline">View Rescheduled Invoice</a>
                          ) : (
                            ticketData.first_invoice && <a href={ticketData.first_invoice} target="_blank" rel="noopener noreferrer" className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-full underline">View Invoice</a>
                          )}
                          {(ticketData.attached_links || []).map((link: string, idx: number) => <a key={idx} href={link} target="_blank" rel="noopener noreferrer" className="px-3 py-1 bg-slate-100 text-slate-700 text-xs font-semibold rounded-full underline">View Link {idx+1}</a>)}
                        </div>

                        {hasMultipleProjects ? (
                          <div className="col-span-2 space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                            <span className="block text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Purchase Orders by Project (Multiple):</span>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {selectedProjectsObjList.map((p, idx) => {
                                const poVal = viewProjectPOs?.[p.id] || '-';
                                return (
                                  <div key={p.id} className="text-sm bg-white p-2 border border-slate-100 rounded flex justify-between items-center">
                                    <span className="text-slate-600 font-medium truncate max-w-[180px]" title={p.name}>{p.name}:</span>
                                    <span className="font-mono font-bold text-emerald-700 bg-emerald-50/50 px-2 py-0.5 rounded border border-emerald-100">{poVal}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div><span className="block text-slate-500">PO Number:</span> <span className="font-medium">{viewPoNumber || '-'}</span></div>
                        )}

                        <div><span className="block text-slate-500">PO Date:</span> <span className="font-medium">{viewPoDate || '-'}</span></div>
                        <div><span className="block text-slate-500">Invoice Number:</span> <span className="font-medium">{viewInvoiceNumber || '-'}</span></div>
                        <div><span className="block text-slate-500">Invoice Date:</span> <span className="font-medium">{viewInvoiceDate || '-'}</span></div>
                        <div><span className="block text-slate-500">Invoice Amount:</span> <span className="font-medium">{viewInvoiceAmount ? `$${viewInvoiceAmount}` : '-'}</span></div>
                        <div>
                          <span className="block text-slate-500">PO Status:</span> 
                          <span className={`font-medium ${viewPoStatus === 'check cannot proceed' ? 'text-red-600' : viewPoStatus === 'payment done' ? 'text-emerald-600' : 'text-slate-800'}`}>
                            {viewPoStatus || '-'}
                          </span>
                          {(role === 'ADMIN1' || role === 'ADMIN') && ticketData.stage3_completed && (
                            <button
                              onClick={openPaymentModal}
                              className="ml-4 text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded inline-flex items-center gap-1 shadow-xs hover:shadow-sm"
                            >
                              {viewPoStatus === 'payment done' ? 'Edit Payment Info' : 'Mark as Payment Done'}
                            </button>
                          )}
                        </div>

                        {viewPaymentDate && (
                          <div>
                            <span className="block text-slate-500">Payment Date:</span>
                            <span className="font-medium">
                              {parseInitialPaymentDate(viewPaymentDate)}
                            </span>
                          </div>
                        )}
                        {viewPaymentInvoiceNumbers && (
                          <div>
                            <span className="block text-slate-500">Payment Invoice/Receipt No(s):</span>
                            <span className="font-medium font-mono text-xs bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              {viewPaymentInvoiceNumbers}
                            </span>
                          </div>
                        )}
                        {viewPoStatus === 'payment done' && viewTravelAgent && (
                          <div>
                            <span className="block text-slate-500">Paid To (Travel Agent):</span>
                            <span className="font-medium text-emerald-700 font-semibold">
                              {viewTravelAgent}
                            </span>
                          </div>
                        )}
                        {viewPoStatus === 'check cannot proceed' && (
                          <div className="col-span-2">
                            <span className="block text-slate-500">Remarks:</span>
                            <span className="font-medium text-red-600">{viewPoRemarks || '-'}</span>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Activity Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 sticky top-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
              <Clock className="h-5 w-5 mr-2 text-slate-500" />
              Activity Log
            </h3>
            <motion.div 
              variants={{
                hidden: { opacity: 0 },
                show: {
                  opacity: 1,
                  transition: {
                    staggerChildren: 0.08
                  }
                }
              }}
              initial="hidden"
              animate="show"
              className="relative border-l border-slate-200 ml-3 space-y-6"
            >
              {activityLogs.map((log, index) => (
                <motion.div 
                  key={index} 
                  variants={{
                    hidden: { opacity: 0, y: 10 },
                    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100, damping: 15 } }
                  }}
                  className="relative pl-6"
                >
                  <div className="absolute -left-1.5 top-1.5 h-3 w-3 rounded-full bg-slate-300 border-2 border-white"></div>
                  <div className="text-sm font-medium text-slate-800">
                    {log.action.replace(/_/g, ' ').toUpperCase()}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {log.user_name ? <>by <span className="font-medium text-slate-700">{log.user_name}</span> ({log.user_role}) · </> : null}
                    {log.timestamp ? format(new Date(log.timestamp.includes('T') ? log.timestamp : log.timestamp.replace(' ', 'T') + 'Z'), 'MMM d, yyyy h:mm a') : 'Unknown time'}
                  </div>
                  {log.new_values && (
                    <div className="text-xs text-slate-600 mt-1 bg-slate-50 rounded px-2 py-1 font-mono break-all">
                      {log.new_values}
                    </div>
                  )}
                </motion.div>
              ))}
            </motion.div>
            {activityLogs.length === 0 && (
              <div className="text-sm text-slate-500 text-center py-4">No activity recorded yet.</div>
            )}
          </div>
        </div>

      </main>
      <EditStage1Modal 
        isOpen={isEditStage1ModalOpen && !hasPoAssigned} 
        onClose={() => setIsEditStage1ModalOpen(false)} 
        ticket={ticketData} 
        projects={projects} 
        onSuccess={fetchData} 
      />
      {isAdminAuthModalOpen && (
        <div id="admin-auth-modal" className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 flex items-center">
                <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
                Admin Authorization Required
              </h3>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-600 rounded-full p-1 hover:bg-slate-100 transition-colors"
                onClick={() => setIsAdminAuthModalOpen(false)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleAdminAuthorizedDelete} className="mt-4 space-y-4">
              <p className="text-sm text-slate-600">
                You are currently logged in as <span className="font-semibold text-slate-800">Admin 1</span>. Deleting ticket records requires a master <span className="font-semibold text-slate-800">Admin</span> credentials approval.
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
                  onClick={() => setIsAdminAuthModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isDeleting ? "Authorizing..." : "Authorize & Delete"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {lightboxImage && (
        <div id="lightbox-overlay" className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative bg-white rounded-xl shadow-2xl max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-4">
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-full p-1.5 transition-colors"
              title="Close Preview"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex-1 flex justify-center items-center overflow-auto p-4 max-h-[75vh]">
              {isPdfUrl(lightboxImage) ? (
                <iframe src={lightboxImage} title="PDF Preview" className="w-[75vw] h-[65vh] border border-slate-300 rounded-lg bg-slate-100" />
              ) : isWebUrl(lightboxImage) ? (
                <div className="text-center p-8 bg-slate-50 rounded-lg border border-slate-200 max-w-md my-8">
                  <FileText className="w-16 h-16 text-sky-500 mx-auto mb-4 animate-bounce" />
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
              ) : (
                <img src={lightboxImage} alt="Document Preview" className="max-w-full max-h-full object-contain rounded border border-slate-200" />
              )}
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-between items-center bg-slate-50 -mx-4 -mb-4">
              <span className="text-sm font-medium text-slate-500 font-sans">Document Image Preview</span>
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => handleDownloadFile(lightboxImage, 'Document_Scan.png')}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-sm flex items-center transition-colors font-sans cursor-pointer"
                >
                  <Download className="w-4 h-4 mr-1" />
                  Download File
                </button>
                <button
                  type="button"
                  onClick={() => setLightboxImage(null)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-lg flex items-center transition-colors font-sans"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Done Details Modal */}
      {isPaymentModalOpen && (
        <div id="payment-details-modal" className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 flex items-center">
                <CheckCircle className="w-5 h-5 text-emerald-600 mr-2" />
                Update Payment Done Details
              </h3>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-600 rounded-full p-1 hover:bg-slate-100 transition-colors"
                onClick={() => setIsPaymentModalOpen(false)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handlePaymentSubmit} className="mt-4 space-y-4">
              <p className="text-sm text-slate-600">
                Provide the details of the processed payment for this ticket. These details will be recorded for audit and tracking.
              </p>
              
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Payment Date *
                </label>
                <input
                  required
                  type="date"
                  className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 focus:bg-white text-sm"
                  value={paymentForm.payment_date}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, payment_date: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Payment Invoice/Receipt Number(s) *
                </label>
                <input
                  required
                  type="text"
                  className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 focus:bg-white text-sm font-mono"
                  placeholder="e.g. INV-PAY-90184, REC-1204"
                  value={paymentForm.payment_invoice_numbers}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, payment_invoice_numbers: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Travel Agent (Paid To) *
                </label>
                {isAddingNewPaymentAgent ? (
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      type="text"
                      className="flex-1 p-2 border border-slate-300 rounded-lg outline-none text-sm"
                      placeholder="New agent name..."
                      value={newPaymentAgentName}
                      onChange={(e) => setNewPaymentAgentName(e.target.value)}
                    />
                    <button
                      type="button"
                      className="px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs"
                      onClick={async () => {
                        if (!newPaymentAgentName.trim()) return;
                        try {
                          const res = await api.post('/options', { category: 'TRAVEL_AGENT', value: newPaymentAgentName.trim() });
                          toast.success('Agent added');
                          setOptions(prev => [...prev, res.data]);
                          setPaymentForm(prev => ({ ...prev, travel_agent: newPaymentAgentName.trim() }));
                          setIsAddingNewPaymentAgent(false);
                          setNewPaymentAgentName('');
                        } catch (error: any) {
                          toast.error('Failed to add agent');
                        }
                      }}
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      className="px-2 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded text-xs"
                      onClick={() => setIsAddingNewPaymentAgent(false)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <select
                      required
                      className="flex-1 p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 focus:bg-white text-sm font-semibold text-black"
                      value={paymentForm.travel_agent}
                      onChange={(e) => {
                        if (e.target.value === 'ADD_NEW') {
                          setIsAddingNewPaymentAgent(true);
                        } else {
                          setPaymentForm(prev => ({ ...prev, travel_agent: e.target.value }));
                        }
                      }}
                    >
                      <option value="">-- Select Travel Agent --</option>
                      {getFilteredOptions('TRAVEL_AGENT').map((o: any) => (
                        <option key={o.id} value={o.value}>{o.value}</option>
                      ))}
                      <option value="ADD_NEW" className="text-sky-600 font-bold">+ Add New Travel Agent</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  onClick={() => setIsPaymentModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPayment}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {savingPayment ? "Saving..." : "Save Payment Details"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
