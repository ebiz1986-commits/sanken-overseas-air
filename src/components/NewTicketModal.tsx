import React, { useState, useEffect } from 'react';
import { X, FileText, AlertCircle, Upload, Download } from 'lucide-react';
import api from '../api';
import toast from 'react-hot-toast';
import { useFormValidation } from '../hooks/useFormValidation';
import FieldError from './FieldError';
import { processAndCompressFile } from '../lib/fileCompressor';

const isPdfUrl = (url: string | null): boolean => {
  if (!url) return false;
  return url.startsWith('data:application/pdf') || url.includes('.pdf') || url.includes('pdf;base64');
};

interface NewTicketModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  projects: any[];
  tickets?: any[];
  onSuccess: () => void;
  isEmbedded?: boolean;
}

export default function NewTicketModal({ isOpen = true, onClose, projects, tickets, onSuccess, isEmbedded = false }: NewTicketModalProps) {
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<any[]>([]);
  const [loadedTickets, setLoadedTickets] = useState<any[]>([]);
  const { errors, handleBlur, handleChange: handleValidationChange, validateForm, clearErrors } = useFormValidation();
  const [formData, setFormData] = useState({
    passenger_name: '',
    pp_number: '',
    job_category: '',
    ticket_type: 'ONE_WAY',
    company: '',
    project_id: '',
    project_ids: [] as string[],
    project_pos: {} as Record<string, string>,
    po_number: '',
    ticket_arranged_date: '',
    approved_rate: 0,
    currency: 'USD',
    travel_agent: '',
    route: '',
    departure_date: '',
    arrival_date: '',
    flight_status: 'PENDING',
    first_atbf: '',
    first_invoice: '',
    first_invoice_number: '',
    first_invoice_date: '',
    attached_images: [] as string[],
    subcontractor_entitlement_applied: false
  });

  const [entryMode, setEntryMode] = useState<'SINGLE' | 'BULK'>('SINGLE');
  const [bulkPassengers, setBulkPassengers] = useState<Array<{ id: string, passenger_name: string, pp_number: string, approved_rate: number, job_category: string }>>([
    { id: 'initial-row-0', passenger_name: '', pp_number: '', approved_rate: 0, job_category: '' }
  ]);
  const [focusedRowIndex, setFocusedRowIndex] = useState<number>(0);

  const entitlementInfo = React.useMemo(() => {
    const selectedProjectId = formData.project_id || (formData.project_ids && formData.project_ids[0]);
    const selectedCompany = formData.company;

    if (!selectedProjectId || !selectedCompany) {
      return null;
    }

    const proj = projects.find(p => p.id === selectedProjectId);
    if (!proj) return null;

    const cycles = proj.company_entitlement_cycles || {};
    const periods = proj.company_entitlement_periods || {};
    const starts = proj.company_entitlement_starts || {};

    const cycle = cycles[selectedCompany] || 'PROJECT_PERIOD';
    const periodMonths = parseInt(String(periods[selectedCompany] || '12')) || 12;
    const startDateStr = starts[selectedCompany] || '';

    let initial = 0;
    const companyEnts = proj.company_entitlements || {};
    if (selectedCompany && companyEnts[selectedCompany] !== undefined) {
      initial = parseInt(String(companyEnts[selectedCompany])) || 0;
    } else {
      initial = parseInt(proj.entitlement_total) || 0;
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const previouslyApplied = loadedTickets.filter(t => {
      const isApplied = !!t.subcontractor_entitlement_applied;
      const matchesProject = t.project_id === selectedProjectId || (Array.isArray(t.project_ids) && t.project_ids.includes(selectedProjectId));
      const matchesCompany = String(t.company || '').trim().toLowerCase() === selectedCompany.trim().toLowerCase();
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

    const currentBatchCount = entryMode === 'SINGLE' ? 1 : bulkPassengers.length;
    const remainingBefore = initial - previouslyApplied;
    const remainingAfter = remainingBefore - currentBatchCount;
    const isExceeded = remainingAfter < 0;
    const exceedBy = isExceeded ? Math.abs(remainingAfter) : 0;

    let isExpired = false;
    let expirationWarningStr = '';
    if (cycle === 'PROJECT_PERIOD' && startDateStr) {
      try {
        const start = new Date(startDateStr);
        if (!isNaN(start.getTime())) {
          const expiryDate = new Date(start);
          expiryDate.setMonth(expiryDate.getMonth() + periodMonths);
          if (now > expiryDate) {
            isExpired = true;
            expirationWarningStr = `The pre-agreed entitlement period of ${periodMonths} months starting from ${startDateStr} expired on ${expiryDate.toISOString().split('T')[0]}.`;
          }
        }
      } catch (err) {
        console.error("Error evaluating expiry:", err);
      }
    }

    return {
      initial,
      cycle,
      periodMonths,
      startDateStr,
      previouslyApplied,
      currentBatchCount,
      remainingBefore,
      remainingAfter,
      isExceeded,
      exceedBy,
      isExpired,
      expirationWarningStr
    };
  }, [formData.project_id, formData.project_ids, formData.company, loadedTickets, projects, entryMode, bulkPassengers.length]);

  const addBulkPassenger = () => {
    const newId = `row-${Date.now()}-${Math.random()}`;
    setBulkPassengers(prev => [
      ...prev,
      { 
        id: newId,
        passenger_name: '', 
        pp_number: '', 
        approved_rate: formData.approved_rate || 0,
        job_category: formData.job_category || ''
      }
    ]);
    // Automatically focus on the newly added row
    setFocusedRowIndex(bulkPassengers.length);
  };

  const removeBulkPassenger = (index: number) => {
    if (bulkPassengers.length <= 1) {
      toast.error("At least one passenger is required in bulk entry.");
      return;
    }
    setBulkPassengers(prev => prev.filter((_, i) => i !== index));
    if (focusedRowIndex >= bulkPassengers.length - 1) {
      setFocusedRowIndex(prev => Math.max(0, prev - 1));
    }
  };

  const handleBulkPassengerChange = (index: number, key: 'passenger_name' | 'pp_number' | 'approved_rate' | 'job_category', value: any) => {
    setBulkPassengers(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [key]: key === 'approved_rate' ? (parseFloat(value) || 0) : value
      };
      return updated;
    });
  };

  const handleProjectCheckboxChange = (projectId: string, checked: boolean) => {
    setFormData(prev => {
      let nextIds = prev.project_ids || [];
      const nextProjectPos = { ...(prev.project_pos || {}) };
      
      if (checked) {
        if (!nextIds.includes(projectId)) {
          nextIds = [...nextIds, projectId];
        }
      } else {
        nextIds = nextIds.filter(id => id !== projectId);
        delete nextProjectPos[projectId];
      }
      
      // Auto-fill company when first project is selected
      let company = prev.company;
      if (nextIds.length > 0) {
        const selectedProj = projects.find(p => p.id === nextIds[0]);
        if (selectedProj && selectedProj.company) {
          company = selectedProj.company;
        }
      }

      // Re-calculate the combined po_number string from the updated project_pos dictionary matching selected projects
      const combinedPO = Object.entries(nextProjectPos)
        .filter(([id, val]) => nextIds.includes(id) && val)
        .map(([_, val]) => val)
        .join(', ');
      
      return {
        ...prev,
        project_ids: nextIds,
        project_id: nextIds[0] || '', // primary project ID
        project_pos: nextProjectPos,
        po_number: combinedPO,
        company
      };
    });
  };

  const [isScanningFirstInvoice, setIsScanningFirstInvoice] = useState(false);

  const scanInvoiceFile = async (base64Data: string, isFirst: boolean) => {
    if (isFirst) {
      setIsScanningFirstInvoice(true);
    }
    try {
      const response = await api.post('/scan-invoice', { fileData: base64Data });
      const extractedNo = response.data.invoice_number;
      if (extractedNo) {
        toast.success(`Automatically detected invoice number: ${extractedNo}`);
        setFormData(prev => ({
          ...prev,
          first_invoice_number: extractedNo
        }));
      } else {
        toast.error("Could not auto-detect invoice number. Please enter it manually.");
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to auto-scan invoice. Enter it manually if needed.");
    } finally {
      if (isFirst) {
        setIsScanningFirstInvoice(false);
      }
    }
  };

  const [isAddingNewAgent, setIsAddingNewAgent] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');

  useEffect(() => {
    if (isOpen) {
      api.get('/options').then(res => setOptions(Array.isArray(res.data) ? res.data : [])).catch(console.error);
      if (tickets) {
        setLoadedTickets(tickets);
      } else {
        api.get('/tickets?limit=1500').then(res => setLoadedTickets(res.data?.tickets || res.data || [])).catch(console.error);
      }
      clearErrors();
    }
  }, [isOpen, tickets]);

  const handleSaveNewAgent = async () => {
    if (!newAgentName.trim()) return;
    try {
      const res = await api.post('/options', { category: 'TRAVEL_AGENT', value: newAgentName.trim() });
      toast.success('Agent added');
      setOptions(prev => [...prev, res.data]);
      setFormData(prev => ({ ...prev, travel_agent: newAgentName.trim() }));
      setIsAddingNewAgent(false);
      setNewAgentName('');
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to add agent');
    }
  };

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    handleValidationChange(e);
    const { name, value } = e.target;
    setFormData(prev => {
      const next = {
        ...prev,
        [name]: name === 'approved_rate' ? parseFloat(value) || 0 : value
      };
      
      // Auto-fill company when project is selected
      if (name === 'project_id' && value) {
        const selectedProj = projects.find(p => p.id === value);
        if (selectedProj && selectedProj.company) {
          next.company = selectedProj.company;
        }
      }
      
      return next;
    });
  };

  const getMultiProjectPOValidationError = () => {
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.project_ids || formData.project_ids.length === 0) {
      toast.error('Please select at least one project');
      return;
    }
    const poValidationError = getMultiProjectPOValidationError();
    if (poValidationError) {
      toast.error(poValidationError);
      return;
    }

    if (entryMode === 'SINGLE') {
      if (!validateForm(e.target as HTMLFormElement)) {
        toast.error('Please fix the errors in the form before submitting');
        return;
      }
    } else {
      // Bulk validation
      for (let i = 0; i < bulkPassengers.length; i++) {
        const p = bulkPassengers[i];
        if (!p.passenger_name.trim()) {
          toast.error(`Row ${i + 1}: Passenger Name is required`);
          return;
        }
        if (!p.pp_number.trim()) {
          toast.error(`Row ${i + 1}: Passport Number is required for passenger '${p.passenger_name}'`);
          return;
        }
      }
    }

    setLoading(true);
    try {
      const exceeded = !!(formData.subcontractor_entitlement_applied && entitlementInfo && entitlementInfo.isExceeded);
      const exceed_by = formData.subcontractor_entitlement_applied && entitlementInfo ? entitlementInfo.exceedBy : 0;

      if (entryMode === 'SINGLE') {
        await api.post('/tickets', {
          ...formData,
          subcontractor_entitlement_exceeded: exceeded,
          subcontractor_entitlement_exceed_by: exceed_by
        });
        toast.success('Ticket created successfully');
      } else {
        const sharedData = {
          job_category: formData.job_category,
          ticket_type: formData.ticket_type,
          company: formData.company,
          project_id: formData.project_id,
          project_ids: formData.project_ids,
          project_pos: formData.project_pos,
          po_number: formData.po_number,
          ticket_arranged_date: formData.ticket_arranged_date,
          currency: formData.currency,
          travel_agent: formData.travel_agent,
          route: formData.route,
          departure_date: formData.departure_date,
          arrival_date: formData.arrival_date,
          flight_status: formData.flight_status,
          first_atbf: formData.first_atbf,
          first_invoice: formData.first_invoice,
          first_invoice_number: formData.first_invoice_number,
          first_invoice_date: formData.first_invoice_date,
          attached_images: formData.attached_images,
          subcontractor_entitlement_applied: formData.subcontractor_entitlement_applied,
          subcontractor_entitlement_exceeded: exceeded,
          subcontractor_entitlement_exceed_by: exceed_by
        };

        const payload = {
          shared: sharedData,
          passengers: bulkPassengers.map(p => ({
            passenger_name: p.passenger_name.trim().toUpperCase(),
            pp_number: p.pp_number.trim().toUpperCase().replace(/\s/g, ''),
            approved_rate: p.approved_rate,
            job_category: p.job_category
          }))
        };

        const res = await api.post('/tickets/bulk', payload);
        toast.success(`Successfully created ${res.data.count || bulkPassengers.length} tickets in bulk.`);
      }
      
       // Reset form
       setFormData({
         passenger_name: '',
         pp_number: '',
         job_category: '',
         ticket_type: 'ONE_WAY',
         company: '',
         project_id: '',
         project_ids: [],
         project_pos: {},
         po_number: '',
         ticket_arranged_date: '',
         approved_rate: 0,
         currency: 'USD',
         travel_agent: '',
         route: '',
         departure_date: '',
         arrival_date: '',
         flight_status: 'PENDING',
         first_atbf: '',
         first_invoice: '',
         first_invoice_number: '',
         first_invoice_date: '',
         attached_images: [],
         subcontractor_entitlement_applied: false
       });
       setBulkPassengers([{ id: 'initial-row-0', passenger_name: '', pp_number: '', approved_rate: 0, job_category: '' }]);
       setFocusedRowIndex(0);
       
      onSuccess();
      if (onClose) onClose();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to create ticket(s)');
    } finally {
      setLoading(false);
    }
  };

  const mainContent = (
      <div className={`bg-white ${isEmbedded ? 'rounded-xl shadow-sm border border-slate-200' : `rounded-xl shadow-xl w-full ${entryMode === 'BULK' ? 'max-w-5xl' : 'max-w-2xl'} max-h-[90vh]`} overflow-hidden flex flex-col`}>
        <div className="flex flex-col p-6 border-b border-slate-200 gap-4">
          <div className="flex justify-between items-center">
            <h2 id="new-ticket-modal-title" className="text-xl font-bold text-slate-900">Create New Ticket</h2>
            {!isEmbedded && onClose && (
              <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500 rounded p-1 transition-colors" aria-label="Close modal">
                <X className="h-6 w-6" aria-hidden="true" />
              </button>
            )}
          </div>
          
          <div className="flex bg-slate-100 p-1 rounded-lg self-start">
            <button
              type="button"
              onClick={() => setEntryMode('SINGLE')}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${entryMode === 'SINGLE' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Single Ticket
            </button>
            <button
              type="button"
              onClick={() => setEntryMode('BULK')}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${entryMode === 'BULK' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Bulk Entering
            </button>
          </div>
        </div>
        
        <div className="p-6 overflow-y-auto">
          <form id="new-ticket-form" onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {entryMode === 'SINGLE' ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Passenger Name *</label>
                  <input required={entryMode === 'SINGLE'} type="text" name="passenger_name" value={formData.passenger_name} onChange={handleChange} onBlur={handleBlur} className={`w-full p-2 border ${errors.passenger_name ? 'border-red-500' : 'border-slate-300'} rounded-lg focus:ring-2 focus:ring-sky-500 outline-none`} />
                  <FieldError error={errors.passenger_name} />
                  {formData.passenger_name && (
                    <div className="mt-2.5 p-3.5 bg-amber-500/10 border border-amber-500/40 rounded-xl" style={{ backgroundColor: 'rgba(245, 158, 11, 0.08)' }}>
                      <div className="text-xs uppercase font-extrabold tracking-widest mb-1.5" style={{ color: '#f59e0b' }}>
                        Verify Spelling:
                      </div>
                      <div className="text-xl md:text-2xl font-mono font-black tracking-widest break-all select-all py-2 px-3 rounded-lg border" style={{ color: '#ffffff', backgroundColor: '#050d1a', borderColor: 'rgba(245, 158, 11, 0.3)' }}>
                        {formData.passenger_name.toUpperCase()}
                      </div>
                      <div className="text-[11px] font-medium mt-2" style={{ color: '#94a3b8' }}>
                        Please double check letter-by-letter to match passport exactly.
                      </div>
                    </div>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Passport Number *</label>
                  <input required={entryMode === 'SINGLE'} type="text" name="pp_number" value={formData.pp_number} onChange={handleChange} onBlur={handleBlur} className={`w-full p-2 border ${errors.pp_number ? 'border-red-500' : 'border-slate-300'} rounded-lg focus:ring-2 focus:ring-sky-500 outline-none`} />
                  <FieldError error={errors.pp_number} />
                </div>
              </>
            ) : (
              <div className="col-span-1 md:col-span-2 bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4 shadow-inner">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Bulk Passengers entering table</h3>
                    <p className="text-xs text-slate-500 font-sans">Enter multiple names/rates/job categories under the same shared invoice number.</p>
                  </div>
                  <button
                    type="button"
                    onClick={addBulkPassenger}
                    className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center transition-colors shadow-sm"
                  >
                    + Add Passenger Row
                  </button>
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-xs font-bold uppercase text-slate-600">
                        <th className="py-2.5 px-3 text-center w-12">#</th>
                        <th className="py-2.5 px-3 w-1/3">Passenger Name *</th>
                        <th className="py-2.5 px-3">Passport Number *</th>
                        <th className="py-2.5 px-3">Job Category</th>
                        <th className="py-2.5 px-3 w-36">Approved Rate ({formData.currency})</th>
                        <th className="py-2.5 px-3 text-center w-16">Remove</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {bulkPassengers.map((row, index) => {
                        const isFocused = focusedRowIndex === index;
                        return (
                          <tr key={row.id || `bulk-row-${index}`} className={`transition-all ${isFocused ? 'bg-sky-50/70 border-l-2 border-sky-500' : 'hover:bg-slate-50/50'}`}>
                            <td className="py-2 px-3 text-center text-xs font-mono font-bold text-slate-400">
                              {index + 1}
                            </td>
                            <td className="py-2 px-3">
                              <input
                                required
                                type="text"
                                value={row.passenger_name}
                                onChange={(e) => handleBulkPassengerChange(index, 'passenger_name', e.target.value)}
                                onFocus={() => setFocusedRowIndex(index)}
                                onBlur={(e) => handleBulkPassengerChange(index, 'passenger_name', e.target.value.toUpperCase())}
                                className="w-full text-sm p-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-sky-500 outline-none font-medium text-slate-900"
                                placeholder="Full name matching passport"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <input
                                required
                                type="text"
                                value={row.pp_number}
                                onChange={(e) => handleBulkPassengerChange(index, 'pp_number', e.target.value)}
                                onFocus={() => setFocusedRowIndex(index)}
                                onBlur={(e) => handleBulkPassengerChange(index, 'pp_number', e.target.value.toUpperCase().replace(/\s/g, ''))}
                                className="w-full text-xs p-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-sky-500 outline-none font-mono text-slate-800"
                                placeholder="Passport number"
                              />
                            </td>
                             <td className="py-2 px-3">
                              <select
                                value={row.job_category}
                                onFocus={() => setFocusedRowIndex(index)}
                                onChange={(e) => handleBulkPassengerChange(index, 'job_category', e.target.value)}
                                className="w-full text-xs p-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-sky-500 outline-none bg-white text-slate-800"
                              >
                                <option value="">Select...</option>
                                {Array.isArray(options) && options.filter(o => o.category === 'JOB_CATEGORY').map((o, optIdx) => (
                                  <option key={o.id || `bulk-job-cat-${o.value}-${optIdx}`} value={o.value}>{o.value}</option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="number"
                                step="0.01"
                                value={row.approved_rate || ''}
                                onFocus={() => setFocusedRowIndex(index)}
                                onChange={(e) => handleBulkPassengerChange(index, 'approved_rate', e.target.value)}
                                className="w-full text-sm p-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-sky-500 outline-none text-slate-800 font-sans"
                                placeholder="0.00"
                              />
                            </td>
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => removeBulkPassenger(index)}
                                className="text-red-500 hover:text-red-700 p-1.5 rounded hover:bg-red-50 transition-colors"
                                title="Delete Row"
                              >
                                <X className="w-4 h-4 mx-auto" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                
                <div className="flex justify-between items-center text-xs text-slate-500 font-medium px-1">
                  <span>Total Passengers to register: <strong className="text-slate-700">{bulkPassengers.length}</strong></span>
                  <span className="text-slate-400 italic">Click on any input to select that row for checking.</span>
                </div>

                {/* Highly Visible spelling verification for the currently active editing row */}
                {focusedRowIndex !== null && bulkPassengers[focusedRowIndex] && (
                  <div className="mt-3.5 p-4.5 bg-amber-500/10 border border-amber-500/30 rounded-xl" style={{ backgroundColor: 'rgba(245, 158, 11, 0.08)' }}>
                    <div className="flex items-center gap-1.5 text-xs uppercase font-extrabold tracking-widest text-amber-700 mb-2" style={{ color: '#f59e0b' }}>
                      <span className="animate-pulse">🔍</span> Verify Spelling for Row #{focusedRowIndex + 1}:
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                          Passenger Full Name (Verify Letter-by-Letter)
                        </span>
                        {bulkPassengers[focusedRowIndex].passenger_name ? (
                          <div className="text-lg md:text-xl font-mono font-black tracking-wider break-all select-all py-2 px-3 rounded-lg border bg-[#050d1a] text-white border-amber-500/30">
                            {bulkPassengers[focusedRowIndex].passenger_name.toUpperCase()}
                          </div>
                        ) : (
                          <div className="text-xs italic text-slate-400 py-2.5 px-3 bg-white border border-slate-200 rounded-lg">
                            (No active name entered yet for Row #{focusedRowIndex + 1})
                          </div>
                        )}
                      </div>

                      <div>
                        <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                          Passport Number (Verify Character correctness)
                        </span>
                        {bulkPassengers[focusedRowIndex].pp_number ? (
                          <div className="text-lg md:text-xl font-mono font-bold tracking-wider break-all select-all py-2 px-3 rounded-lg border bg-[#050d1a] text-[#f59e0b] border-amber-500/30">
                            {bulkPassengers[focusedRowIndex].pp_number.toUpperCase().replace(/\s/g, '')}
                          </div>
                        ) : (
                          <div className="text-xs italic text-slate-400 py-2.5 px-3 bg-white border border-slate-200 rounded-lg">
                            (No passport entered yet for Row #{focusedRowIndex + 1})
                          </div>
                        )}
                      </div>
                    </div>

                    <p className="text-[10px] text-slate-400 font-medium mt-2">
                       Please verify carefully letter-by-letter to match printed physics passport exactly before submitting.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Invoice Number</label>
              <input
                type="text"
                name="first_invoice_number"
                value={formData.first_invoice_number}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="Enter Invoice Number..."
                className={`w-full p-2 border ${errors.first_invoice_number ? 'border-red-500' : 'border-slate-300'} rounded-lg focus:ring-2 focus:ring-sky-500 outline-none`}
              />
              <FieldError error={errors.first_invoice_number} />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Invoice Date</label>
              <input
                type="date"
                name="first_invoice_date"
                value={formData.first_invoice_date}
                onChange={handleChange}
                onBlur={handleBlur}
                className={`w-full p-2 border ${errors.first_invoice_date ? 'border-red-500' : 'border-slate-300'} rounded-lg focus:ring-2 focus:ring-sky-500 outline-none`}
              />
              <FieldError error={errors.first_invoice_date} />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Job Category</label>
              <select name="job_category" value={formData.job_category} onChange={handleChange} onBlur={handleBlur} className="w-full p-2 border border-brand-border-strong rounded-lg focus:ring-2 focus:ring-brand-accent outline-none bg-brand-surface text-brand-text-strong">
                <option value="">Select...</option>
                {Array.isArray(options) && options.filter(o => o.category === 'JOB_CATEGORY').map((o, idx) => (
                  <option key={o.id || `job-cat-${o.value}-${idx}`} value={o.value}>{o.value}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Re; company</label>
              <select name="company" value={formData.company} onChange={handleChange} onBlur={handleBlur} className="w-full p-2 border border-brand-border-strong rounded-lg focus:ring-2 focus:ring-brand-accent outline-none bg-brand-surface text-brand-text-strong">
                <option value="">Select...</option>
                {Array.isArray(options) && options.filter(o => o.category === 'COMPANY').map((o, idx) => (
                  <option key={o.id || `company-${o.value}-${idx}`} value={o.value}>{o.value}</option>
                ))}
              </select>
            </div>

            <div className="col-span-1 md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Project(s) * <span className="text-xs text-slate-400 font-normal">(Select all that apply)</span></label>
              <div className="border border-slate-200 rounded-lg p-3 max-h-40 overflow-y-auto bg-slate-50 grid grid-cols-1 md:grid-cols-2 gap-2">
                {Array.isArray(projects) && projects.length === 0 ? (
                  <p className="text-xs text-slate-400 col-span-full">No projects available</p>
                ) : (
                  Array.isArray(projects) && projects.map((p, idx) => {
                    const isChecked = formData.project_ids?.includes(p.id) || false;
                    return (
                      <label key={p.id || `proj-${idx}`} className="flex items-start gap-2.5 text-sm font-normal text-slate-700 hover:text-slate-900 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => handleProjectCheckboxChange(p.id, e.target.checked)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                        />
                        <div className="min-w-0">
                          <div className="font-medium text-slate-800 truncate" title={p.name}>{p.name}</div>
                          {p.company && <div className="text-[10px] text-slate-500 font-mono truncate" title={p.company}>{p.company}</div>}
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
              {(!formData.project_ids || formData.project_ids.length === 0) && (
                <p className="text-xs text-red-500 mt-1">Please select at least one project</p>
              )}
            </div>

            {/* Project-specific PO fields disabled as requested by the user */}

            <div className="col-span-1 md:col-span-2 bg-sky-50/40 p-4 rounded-xl border border-sky-100 space-y-4">
              <div className="flex items-start gap-3">
                <input
                  id="subcontractor_entitlement_applied"
                  name="subcontractor_entitlement_applied"
                  type="checkbox"
                  checked={formData.subcontractor_entitlement_applied || false}
                  onChange={(e) => setFormData(prev => ({ ...prev, subcontractor_entitlement_applied: e.target.checked }))}
                  className="mt-0.5 h-5 w-5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                />
                <div>
                  <label htmlFor="subcontractor_entitlement_applied" className="text-sm font-semibold text-slate-800 cursor-pointer select-none">
                    Sub-contractor ticket entitlement apply
                  </label>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Check this if this passenger is using a ticket entitlement for the Re:company ({formData.company || 'unspecified company'}) for the specific project ({projects.find(p => p.id === formData.project_id)?.name || 'unspecified project'}).
                  </p>
                </div>
              </div>

              {formData.subcontractor_entitlement_applied && (
                <div className="mt-3 text-xs border-t border-sky-150 pt-3">
                  {!formData.project_id || !formData.company ? (
                    <p className="text-rose-600 font-medium flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      Please select both a Project and a Re; company to view current subcontractor ticket entitlement balances.
                    </p>
                  ) : entitlementInfo ? (
                    <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-3xs space-y-2">
                      <div className="flex justify-between items-center text-slate-500 pb-1.5 border-b border-slate-100">
                        <span className="font-semibold text-slate-700">Entitlement Balance Details</span>
                        <span className="font-mono bg-sky-50 text-sky-700 border border-sky-200 px-2 py-0.5 rounded text-[10px] uppercase font-bold">
                          {entitlementInfo.cycle === 'MONTHLY' ? '🗓️ Monthly Reset' : `🏗️ Project Period (${entitlementInfo.periodMonths}M)`}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium">
                        Company: <strong className="text-slate-700">{formData.company}</strong>
                        {entitlementInfo.cycle === 'PROJECT_PERIOD' && entitlementInfo.startDateStr && (
                          <span className="ml-2">• Starts: <strong className="text-slate-700">{entitlementInfo.startDateStr}</strong></span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-slate-600 font-mono">
                        <div className="bg-slate-50 p-1.5 rounded">
                          <p className="text-[10px] text-slate-400 font-sans uppercase font-medium">Total Initial</p>
                          <p className="text-sm font-extrabold text-slate-800">{entitlementInfo.initial}</p>
                        </div>
                        <div className="bg-slate-50 p-1.5 rounded">
                          <p className="text-[10px] text-slate-400 font-sans uppercase font-medium">
                            {entitlementInfo.cycle === 'MONTHLY' ? 'Used This Month' : 'Previously Used'}
                          </p>
                          <p className="text-sm font-extrabold text-amber-600">{entitlementInfo.previouslyApplied}</p>
                        </div>
                        <div className="bg-slate-50 p-1.5 rounded">
                          <p className="text-[10px] text-slate-400 font-sans uppercase font-medium">This Batch</p>
                          <p className="text-sm font-extrabold text-sky-600">{entitlementInfo.currentBatchCount}</p>
                        </div>
                        <div className={`p-1.5 rounded ${entitlementInfo.remainingAfter < 0 ? 'bg-rose-50 border border-rose-100' : 'bg-emerald-50 border border-emerald-100'}`}>
                          <p className="text-[10px] text-slate-400 font-sans uppercase font-medium">Net Remaining</p>
                          <p className={`text-sm font-extrabold ${entitlementInfo.remainingAfter < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {entitlementInfo.remainingAfter}
                          </p>
                        </div>
                      </div>
                      
                      {entitlementInfo.isExpired && (
                        <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg flex items-start gap-2 mt-2 leading-relaxed">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 animate-pulse" />
                          <div>
                            <p className="font-bold text-xs">⚠️ Entitlement Period Expired!</p>
                            <p className="text-[11px] text-amber-700">
                              {entitlementInfo.expirationWarningStr}
                            </p>
                          </div>
                        </div>
                      )}

                      {entitlementInfo.isExceeded ? (
                        <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-start gap-2 mt-2 leading-relaxed">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 animate-bounce" />
                          <div>
                            <p className="font-bold">🚨 Ticket Entitlement Limit Exceeded!</p>
                            <p className="text-[11px] text-rose-600">
                              Warning: This ticket will exceed the agreed limit of <strong>{entitlementInfo.initial}</strong> tickets configured. It will be recorded as <strong>exceeded by {entitlementInfo.exceedBy}</strong> ticket(s) under this project's company entitlements.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100 flex items-center gap-2 mt-2 font-medium">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                          <span>Within safe entitlement allowance. ({entitlementInfo.remainingAfter} slots left after this ticket)</span>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Ticket Type</label>
              <select name="ticket_type" value={formData.ticket_type} onChange={handleChange} onBlur={handleBlur} className={`w-full p-2 border ${errors.ticket_type ? 'border-red-500' : 'border-brand-border-strong'} rounded-lg focus:ring-2 focus:ring-brand-accent outline-none bg-brand-surface text-brand-text-strong`}>
                <option value="ONE_WAY">One Way</option>
                <option value="RETURN">Return</option>
                {Array.isArray(options) && options.filter(o => o.category === 'TICKET_TYPE').map((o, idx) => (
                  <option key={o.id || `ticket-type-${o.value}-${idx}`} value={o.value}>{o.value}</option>
                ))}
              </select>
              <FieldError error={errors.ticket_type} />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Ticket Arranged Date *</label>
              <input required type="date" name="ticket_arranged_date" value={formData.ticket_arranged_date} onChange={handleChange} onBlur={handleBlur} className={`w-full p-2 border ${errors.ticket_arranged_date ? 'border-red-500' : 'border-slate-300'} rounded-lg focus:ring-2 focus:ring-sky-500 outline-none`} />
              <FieldError error={errors.ticket_arranged_date} />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Travel Agent *</label>
              {isAddingNewAgent ? (
                <div className="flex gap-2">
                  <input autoFocus type="text" value={newAgentName} onChange={e => setNewAgentName(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none" placeholder="New agent..." />
                  <button type="button" onClick={handleSaveNewAgent} className="px-3 bg-sky-600 text-white rounded text-sm hover:bg-sky-700">Add</button>
                  <button type="button" onClick={() => setIsAddingNewAgent(false)} className="px-3 bg-slate-200 text-slate-700 rounded text-sm hover:bg-slate-300">Cancel</button>
                </div>
              ) : (
                <>
                <select required name="travel_agent" value={formData.travel_agent} onBlur={handleBlur} onChange={(e) => {
                    if (e.target.value === 'ADD_NEW') setIsAddingNewAgent(true);
                    else handleChange(e);
                  }} className={`w-full p-2 border ${errors.travel_agent ? 'border-red-500' : 'border-brand-border-strong'} rounded-lg focus:ring-2 focus:ring-brand-accent outline-none bg-brand-surface text-brand-text-strong`}>
                  <option value="">Select...</option>
                  {Array.isArray(options) && options.filter(o => o.category === 'TRAVEL_AGENT').map((o, idx) => (
                    <option key={o.id || `travel-agent-${o.value}-${idx}`} value={o.value}>{o.value}</option>
                  ))}
                  <option value="ADD_NEW" className="font-bold text-sky-600 border-t border-slate-200">+ Add New Agent</option>
                </select>
                <FieldError error={errors.travel_agent} />
                </>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Route</label>
              <select name="route" value={formData.route} onChange={handleChange} onBlur={handleBlur} className={`w-full p-2 border ${errors.route ? 'border-red-500' : 'border-brand-border-strong'} rounded-lg focus:ring-2 focus:ring-brand-accent outline-none bg-brand-surface text-brand-text-strong`}>
                <option value="">Select...</option>
                {Array.isArray(options) && options.filter(o => o.category === 'ROUTE').map((o, idx) => (
                  <option key={o.id || `route-${o.value}-${idx}`} value={o.value}>{o.value}</option>
                ))}
              </select>
              <FieldError error={errors.route} />
            </div>

            <div className="flex space-x-4 md:col-span-2">
              {entryMode !== 'BULK' && (
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Approved Rate
                  </label>
                  <input type="number" step="0.01" name="approved_rate" value={formData.approved_rate} onChange={handleChange} onBlur={handleBlur} className={`w-full p-2 border ${errors.approved_rate ? 'border-red-500' : 'border-slate-300'} rounded-lg focus:ring-2 focus:ring-sky-500 outline-none`} />
                  <FieldError error={errors.approved_rate} />
                </div>
              )}
              <div className={entryMode === 'BULK' ? 'w-full' : 'w-1/3'}>
                <label className="block text-sm font-medium text-slate-700 mb-1">Currency</label>
                <select name="currency" value={formData.currency} onChange={handleChange} onBlur={handleBlur} className={`w-full p-2 border ${errors.currency ? 'border-red-500' : 'border-brand-border-strong'} rounded-lg focus:ring-2 focus:ring-brand-accent outline-none bg-brand-surface text-brand-text-strong`}>
                  <option value="USD">USD</option>
                  <option value="AED">AED</option>
                  <option value="LKR">LKR</option>
                  {Array.isArray(options) && options.filter(o => o.category === 'CURRENCY').map((o, idx) => (
                    <option key={o.id || `currency-${o.value}-${idx}`} value={o.value}>{o.value}</option>
                  ))}
                </select>
                <FieldError error={errors.currency} />
              </div>
            </div>

            <div className="md:col-span-2 pt-4 mt-2 border-t border-slate-200">
              <h3 className="text-md font-semibold text-slate-800 mb-2">First Attempt Attachments</h3>
              <p className="text-xs text-slate-500 mb-4 font-sans">Please attach the original Air Ticket Booking Form (ATBF) and Invoice for this first attempt.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* ATBF Upload */}
                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 flex flex-col justify-between min-h-[140px]">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Air Ticket Booking Form (ATBF)</label>
                    {formData.first_atbf ? (
                      <div className="mt-2 flex items-center space-x-3 bg-white p-2 border border-slate-200 rounded-lg shadow-sm">
                        <div className="text-xs min-w-0 flex-1">
                          <span className="text-sky-600 font-semibold block">ATBF Attached ✓</span>
                          <a href={formData.first_atbf} target="_blank" rel="noopener noreferrer" className="text-slate-400 block text-[10px] truncate underline">View Attachment</a>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, first_atbf: '' }))}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded text-xs font-medium transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <input
                          type="url"
                          placeholder="Paste SharePoint Link..."
                          className="text-xs p-2 border border-slate-300 rounded w-full outline-none focus:border-sky-500 font-medium"
                          onBlur={(e) => {
                            if (e.target.value) {
                                setFormData(prev => ({ ...prev, first_atbf: e.target.value }));
                            }
                          }}
                        />
                        <div className="text-center text-[9px] text-slate-450 font-bold uppercase tracking-wider py-0.5">OR</div>
                        <label className="flex items-center justify-center gap-1.5 border border-dashed border-slate-300 hover:border-sky-500 rounded-lg p-2 bg-white cursor-pointer hover:bg-sky-50/20 transition-all text-xs font-semibold text-slate-600">
                          <Upload className="w-3.5 h-3.5 text-slate-400" />
                          <span>Upload File ...</span>
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const base64 = await processAndCompressFile(file);
                                if (base64) {
                                  setFormData(prev => ({ ...prev, first_atbf: base64 }));
                                }
                              }
                            }}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                {/* Invoice Upload */}
                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 flex flex-col justify-between min-h-[140px]">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">First Attempt Invoice</label>
                    {formData.first_invoice ? (
                      <div className="mt-2 flex flex-col gap-2">
                        <div className="flex items-center space-x-3 bg-white p-2 border border-slate-200 rounded-lg shadow-sm">
                          <div className="text-xs min-w-0 flex-1">
                            <span className="text-emerald-600 font-semibold block">Invoice Link Attached ✓</span>
                            <a href={formData.first_invoice} target="_blank" rel="noopener noreferrer" className="text-slate-400 block text-[10px] truncate underline">View Link</a>
                          </div>
                          <button
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, first_invoice: '', first_invoice_number: '', first_invoice_date: '' }))}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded text-xs font-medium transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                        
                        {/* Invoice Number Input Field */}
                        <div className="bg-white p-2 border border-slate-200 rounded-lg shadow-sm">
                          <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
                            Detected Invoice Number
                          </label>
                          <input
                            type="text"
                            value={formData.first_invoice_number}
                            onChange={(e) => setFormData(prev => ({ ...prev, first_invoice_number: e.target.value }))}
                            placeholder="Invoice reference number"
                            className="text-xs p-2 border border-slate-200 rounded w-full outline-none focus:border-sky-500 font-medium font-mono"
                          />
                        </div>

                        {/* Invoice Date Input Field (Synchronized) */}
                        <div className="bg-white p-2 border border-slate-200 rounded-lg shadow-sm">
                          <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
                            Invoice Date
                          </label>
                          <input
                            type="date"
                            value={formData.first_invoice_date}
                            onChange={(e) => setFormData(prev => ({ ...prev, first_invoice_date: e.target.value }))}
                            className="text-xs p-2 border border-slate-200 rounded w-full outline-none focus:border-sky-500 font-medium"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <input
                          type="url"
                          placeholder="Paste SharePoint Link..."
                          className="text-xs p-2 border border-slate-300 rounded w-full outline-none focus:border-sky-500 font-medium"
                          onBlur={(e) => {
                            if (e.target.value) {
                                setFormData(prev => ({ ...prev, first_invoice: e.target.value }));
                            }
                          }}
                        />
                        <div className="text-center text-[9px] text-slate-450 font-bold uppercase tracking-wider py-0.5">OR</div>
                        <label className="flex items-center justify-center gap-1.5 border border-dashed border-slate-300 hover:border-sky-500 rounded-lg p-2 bg-white cursor-pointer hover:bg-sky-50/20 transition-all text-xs font-semibold text-slate-600">
                          <Upload className="w-3.5 h-3.5 text-slate-400" />
                          <span>Upload File ...</span>
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const base64 = await processAndCompressFile(file);
                                if (base64) {
                                  setFormData(prev => ({ ...prev, first_invoice: base64 }));
                                }
                              }
                            }}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Additional PDF & Image Attachments */}
              <div className="mt-4 border border-slate-200 rounded-lg p-4 bg-slate-50">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Additional PDF or Image Attachments</label>
                <p className="text-xs text-slate-400 mb-3">Attach other relevant files (e.g., visa copies, receipts, alternative options).</p>
                
                {Array.isArray(formData.attached_images) && formData.attached_images.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    {formData.attached_images.map((img: string, idx: number) => (
                      <div key={`att-${idx}-${img.slice(-15)}`} className="flex items-center space-x-3 bg-white p-2 border border-slate-200 rounded-lg shadow-sm">
                        <div className="relative group w-12 h-12 rounded-lg border border-slate-200 overflow-hidden shadow-sm bg-slate-50 flex items-center justify-center flex-shrink-0">
                          {isPdfUrl(img) ? (
                            <div className="w-full h-full bg-red-500/10 flex flex-col items-center justify-center p-0.5">
                              <FileText className="w-6 h-6 text-red-500" />
                              <span className="text-[8px] font-extrabold text-red-600 uppercase">PDF</span>
                            </div>
                          ) : (
                            <img src={img} alt={`Attachment ${idx + 1}`} className="w-full h-full object-cover animate-fade-in" />
                          )}
                        </div>
                        <div className="text-xs min-w-0 flex-1">
                          <span className="font-semibold text-slate-700 block truncate">Attachment {idx + 1}</span>
                          <span className="text-slate-400 block text-[10px]">{isPdfUrl(img) ? 'PDF Document' : 'Image File'}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({
                            ...prev,
                            attached_images: (prev.attached_images || []).filter((_, i) => i !== idx)
                          }))}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded text-xs font-medium transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    onChange={async (e) => {
                      const files = Array.from(e.target.files || []) as File[];
                      for (const file of files) {
                        const base64 = await processAndCompressFile(file);
                        if (base64) {
                          setFormData(prev => ({
                            ...prev,
                            attached_images: [...(prev.attached_images || []), base64]
                          }));
                        }
                      }
                      e.target.value = '';
                    }}
                    className="text-xs text-slate-600 block w-full file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            <div className="md:col-span-2 pt-4 mt-2 border-t border-slate-200">
              <h3 className="text-md font-semibold text-slate-800 mb-4">Agent details</h3>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Departure Date</label>
              <input type="date" name="departure_date" value={formData.departure_date} onChange={handleChange} onBlur={handleBlur} className={`w-full p-2 border ${errors.departure_date ? 'border-red-500' : 'border-slate-300'} rounded-lg focus:ring-2 focus:ring-sky-500 outline-none`} />
              <FieldError error={errors.departure_date} />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Actual Arrival Date</label>
              <input type="date" name="arrival_date" value="" onChange={handleChange} disabled className="w-full p-2 border border-slate-300 rounded-lg outline-none bg-slate-100 text-slate-500 cursor-not-allowed" title="Arrival date can only be updated after departure" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Flight Status</label>
              <select name="flight_status" value="PENDING" onChange={handleChange} disabled className="w-full p-2 border border-slate-300 rounded-lg outline-none bg-slate-100 text-slate-500 cursor-not-allowed" title="Flight status can only be updated after departure">
                <option value="PENDING">PENDING</option>
              </select>
            </div>
          </form>
        </div>

        <div className="p-6 border-t border-slate-200 bg-slate-50 flex justify-end space-x-3 mt-auto">
          {!isEmbedded && onClose && (
            <button type="button" onClick={onClose} className="px-5 py-2 text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 font-medium transition-colors">
              Cancel
            </button>
          )}
          <button type="submit" form="new-ticket-form" disabled={loading} className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">
            {loading ? 'Saving...' : 'Create Ticket'}
          </button>
        </div>
      </div>
  );

  if (isEmbedded) return mainContent;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="new-ticket-modal-title">
      {mainContent}
    </div>
  );
}
