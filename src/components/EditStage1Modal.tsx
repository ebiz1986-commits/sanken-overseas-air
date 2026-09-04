import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { X, AlertCircle, Upload } from 'lucide-react';
import { processAndCompressFile } from '../lib/fileCompressor';
import { uploadDataUriToStorage } from '../lib/storageUpload';
import api from '../api';
import toast from 'react-hot-toast';
import { useFormValidation } from '../hooks/useFormValidation';
import FieldError from './FieldError';

/** Compress a file, upload it to Firebase Storage, and return the URL (or null on failure). */
async function compressAndUpload(file: File, prefix: string): Promise<string | null> {
  const base64 = await processAndCompressFile(file);
  if (!base64) return null;
  try {
    return await uploadDataUriToStorage(base64, prefix);
  } catch (e) {
    console.error('Storage upload failed', e);
    toast.error('File upload failed. Please ensure Firebase Storage is enabled and try again.');
    return null;
  }
}

interface EditStage1ModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: any;
  projects: any[];
  tickets?: any[];
  onSuccess: () => void;
}

export default function EditStage1Modal({ isOpen, onClose, ticket, projects, tickets, onSuccess }: EditStage1ModalProps) {
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
    first_atbf: '',
    first_invoice: '',
    subcontractor_entitlement_applied: false
  });

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
      const isNotCurrent = t.id !== ticket.id;
      if (!isApplied || !matchesProject || !matchesCompany || !isNotCurrent) return false;

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

    const currentBatchCount = 1;
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
  }, [formData.project_id, formData.project_ids, formData.company, loadedTickets, projects, ticket.id]);

  const [isAddingNewAgent, setIsAddingNewAgent] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');

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

      // Re-calculate combined po_number string
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

  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && ticket) {
      api.get('/options').then(res => setOptions(res.data)).catch(console.error);
      if (tickets) {
        setLoadedTickets(tickets);
      } else {
        api.get('/tickets?limit=1500').then(res => setLoadedTickets(res.data?.tickets || res.data || [])).catch(console.error);
      }
      clearErrors();

      let initialData = {
        passenger_name: ticket.passenger_name || '',
        pp_number: ticket.pp_number || '',
        job_category: ticket.job_category || '',
        ticket_type: ticket.ticket_type || 'ONE_WAY',
        company: ticket.company || '',
        project_id: ticket.project_id || '',
        project_ids: ticket.project_ids || (ticket.project_id ? [ticket.project_id] : []) || [],
        project_pos: ticket.project_pos || {},
        po_number: ticket.po_number || '',
        ticket_arranged_date: ticket.ticket_arranged_date || '',
        approved_rate: ticket.approved_rate || 0,
        currency: ticket.currency || 'USD',
        travel_agent: ticket.travel_agent || '',
        route: ticket.route || '',
        first_atbf: ticket.first_atbf || '',
        first_invoice: ticket.first_invoice || '',
        subcontractor_entitlement_applied: ticket.subcontractor_entitlement_applied || false,
      };

      try {
        const savedDraft = localStorage.getItem(`draft_stage1_${ticket.id}`);
        if (savedDraft) {
          const parsed = JSON.parse(savedDraft);
          if (parsed?.data) {
            initialData = parsed.data;
            setDraftSavedAt(parsed.timestamp || 'saved');
          }
        }
      } catch (e) {
        console.warn('Failed restoring stage1 draft', e);
      }

      setFormData(initialData);
    }
  }, [isOpen, ticket, tickets]);

  // Debounced auto-save effect
  useEffect(() => {
    if (!isOpen || !ticket) return;
    const timer = setTimeout(() => {
      try {
        const timeStr = format(new Date(), 'hh:mm:ss a');
        localStorage.setItem(`draft_stage1_${ticket.id}`, JSON.stringify({
          data: formData,
          timestamp: timeStr
        }));
        setDraftSavedAt(timeStr);
      } catch (e) {
        console.warn('Auto-save error', e);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [formData, isOpen, ticket]);

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
      
      if (name === 'project_id' && value) {
        const selectedProj = projects.find(p => p.id === value);
        if (selectedProj && selectedProj.company) {
          next.company = selectedProj.company;
        }
      }
      
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.project_ids || formData.project_ids.length === 0) {
      toast.error('Please select at least one project');
      return;
    }
    if (!validateForm(e.target as HTMLFormElement)) {
      toast.error('Please fix the errors in the form before submitting');
      return;
    }
    setLoading(true);
    try {
      const exceeded = !!(formData.subcontractor_entitlement_applied && entitlementInfo && entitlementInfo.isExceeded);
      const exceed_by = formData.subcontractor_entitlement_applied && entitlementInfo ? entitlementInfo.exceedBy : 0;

      await api.put(`/tickets/${ticket.id}`, {
        ...formData,
        subcontractor_entitlement_exceeded: exceeded,
        subcontractor_entitlement_exceed_by: exceed_by
      });
      try {
        localStorage.removeItem(`draft_stage1_${ticket.id}`);
      } catch (e) {}
      setDraftSavedAt(null);
      toast.success('Ticket updated successfully');
      onSuccess();
      onClose();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to update ticket');
    } finally {
      setLoading(false);
    }
  };

  const getFilteredOptions = (category: string) => (Array.isArray(options) ? options.filter(o => o.category === category) : []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="edit-ticket-modal-title">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-slate-200">
          <h2 id="edit-ticket-modal-title" className="text-xl font-bold text-slate-900">Edit Ticket Details</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500 rounded p-1 transition-colors" aria-label="Close modal">
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto">
          <form id="edit-ticket-form" onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Passenger Name *</label>
              <input required type="text" name="passenger_name" value={formData.passenger_name} onChange={handleChange} onBlur={handleBlur} className={`w-full p-2 border ${errors.passenger_name ? 'border-red-500' : 'border-slate-300'} rounded-lg focus:ring-2 focus:ring-sky-500 outline-none`} />
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
              <input required type="text" name="pp_number" value={formData.pp_number} onChange={handleChange} onBlur={handleBlur} className={`w-full p-2 border ${errors.pp_number ? 'border-red-500' : 'border-slate-300'} rounded-lg focus:ring-2 focus:ring-sky-500 outline-none`} />
              <FieldError error={errors.pp_number} />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Job Category</label>
              <select name="job_category" value={formData.job_category} onChange={handleChange} onBlur={handleBlur} className="w-full p-2 border border-brand-border-strong rounded-lg focus:ring-2 focus:ring-brand-accent outline-none bg-brand-surface text-brand-text-strong">
                <option value="">Select...</option>
                {getFilteredOptions('JOB_CATEGORY').map((o, idx) => (
                  <option key={o.id || `job-cat-${o.value}-${idx}`} value={o.value}>{o.value}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Re; company</label>
              <select name="company" value={formData.company} onChange={handleChange} onBlur={handleBlur} className="w-full p-2 border border-brand-border-strong rounded-lg focus:ring-2 focus:ring-brand-accent outline-none bg-brand-surface text-brand-text-strong">
                <option value="">Select...</option>
                {getFilteredOptions('COMPANY').map((o, idx) => (
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
                      <label key={p.id || `project-${idx}`} className="flex items-start gap-2.5 text-sm font-normal text-slate-700 hover:text-slate-900 cursor-pointer select-none">
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

            {formData.project_ids && formData.project_ids.length > 1 && (
              <div className="col-span-1 md:col-span-2 border border-slate-200/80 rounded-xl p-4 bg-slate-50/50 space-y-3.5 shadow-3xs">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-3.5 bg-sky-500 rounded-full" />
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-600">Project-Specific PO Numbers <span className="text-slate-400 font-normal font-sans text-[10px] lowercase italic">(optional)</span></label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {projects.filter(p => formData.project_ids.includes(p.id)).map((p, idx) => {
                    const poVal = formData.project_pos?.[p.id] || '';
                    return (
                      <div key={p.id || `po-${idx}`} className="bg-white p-3 rounded-xl border border-slate-150 flex flex-col gap-1.5 shadow-2xs hover:border-slate-300 transition-colors">
                        <span className="text-[11px] font-extrabold text-slate-750 truncate" title={p.name}>
                          {idx + 1}. {p.name}
                        </span>
                        <input
                          type="text"
                          placeholder="Enter project PO number..."
                          value={poVal}
                          onChange={(e) => {
                            const poNo = e.target.value;
                            setFormData(prev => {
                              const nextProjectPos = { ...(prev.project_pos || {}), [p.id]: poNo };
                              const combinedPO = Object.entries(nextProjectPos)
                                .filter(([id, val]) => prev.project_ids.includes(id) && val)
                                .map(([_, val]) => val)
                                .join(', ');
                              return {
                                ...prev,
                                project_pos: nextProjectPos,
                                po_number: combinedPO
                              };
                            });
                          }}
                          className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none font-mono bg-slate-50/50 text-slate-900 transition-colors"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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
                          <p className="text-[10px] text-slate-400 font-sans uppercase font-medium">This Ticket</p>
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
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 " />
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
                {getFilteredOptions('TICKET_TYPE').map((o, idx) => (
                  <option key={o.id || `ticket-type-${o.value}-${idx}`} value={o.value}>{o.value}</option>
                ))}
              </select>
              <FieldError error={errors.ticket_type} />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Ticket Arranged Date</label>
              <input type="date" name="ticket_arranged_date" value={formData.ticket_arranged_date} onChange={handleChange} onBlur={handleBlur} className={`w-full p-2 border ${errors.ticket_arranged_date ? 'border-red-500' : 'border-slate-300'} rounded-lg focus:ring-2 focus:ring-sky-500 outline-none`} />
              <FieldError error={errors.ticket_arranged_date} />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Travel Agent</label>
              {isAddingNewAgent ? (
                <div className="flex gap-2">
                  <input autoFocus type="text" value={newAgentName} onChange={e => setNewAgentName(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none" placeholder="New agent..." />
                  <button type="button" onClick={handleSaveNewAgent} className="px-3 bg-sky-600 text-white rounded text-sm hover:bg-sky-700">Add</button>
                  <button type="button" onClick={() => setIsAddingNewAgent(false)} className="px-3 bg-slate-200 text-slate-700 rounded text-sm hover:bg-slate-300">Cancel</button>
                </div>
              ) : (
                <>
                <select name="travel_agent" value={formData.travel_agent} onBlur={handleBlur} onChange={(e) => {
                    if (e.target.value === 'ADD_NEW') setIsAddingNewAgent(true);
                    else handleChange(e);
                  }} className={`w-full p-2 border ${errors.travel_agent ? 'border-red-500' : 'border-brand-border-strong'} rounded-lg focus:ring-2 focus:ring-brand-accent outline-none bg-brand-surface text-brand-text-strong`}>
                  <option value="">Select...</option>
                  {getFilteredOptions('TRAVEL_AGENT').map((o, idx) => (
                    <option key={o.id || `agent-${o.value}-${idx}`} value={o.value}>{o.value}</option>
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
                {getFilteredOptions('ROUTE').map((o, idx) => (
                  <option key={o.id || `route-${o.value}-${idx}`} value={o.value}>{o.value}</option>
                ))}
              </select>
              <FieldError error={errors.route} />
            </div>

            <div className="flex space-x-4 md:col-span-2">
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-700 mb-1">Approved Rate</label>
                <input type="number" step="0.01" name="approved_rate" value={formData.approved_rate} onChange={handleChange} onBlur={handleBlur} className={`w-full p-2 border ${errors.approved_rate ? 'border-red-500' : 'border-slate-300'} rounded-lg focus:ring-2 focus:ring-sky-500 outline-none`} />
                <FieldError error={errors.approved_rate} />
              </div>
              <div className="w-1/3">
                <label className="block text-sm font-medium text-slate-700 mb-1">Currency</label>
                <select name="currency" value={formData.currency} onChange={handleChange} onBlur={handleBlur} className={`w-full p-2 border ${errors.currency ? 'border-red-500' : 'border-brand-border-strong'} rounded-lg focus:ring-2 focus:ring-brand-accent outline-none bg-brand-surface text-brand-text-strong`}>
                  <option value="USD">USD</option>
                  <option value="AED">AED</option>
                  <option value="LKR">LKR</option>
                  {getFilteredOptions('CURRENCY').map((o, idx) => (
                    <option key={o.id || `curr-${o.value}-${idx}`} value={o.value}>{o.value}</option>
                  ))}
                </select>
                <FieldError error={errors.currency} />
              </div>
            </div>

            <div className="md:col-span-2 pt-4 mt-2 border-t border-slate-200">
              <h3 className="text-md font-semibold text-slate-800 mb-2">First Attempt Attachments</h3>
              <p className="text-xs text-slate-500 mb-4">Please attach the original Air Ticket Booking Form (ATBF) and Invoice for this first attempt.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* ATBF Upload */}
                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Air Ticket Booking Form (ATBF)</label>
                  {formData.first_atbf ? (
                    <div className="flex items-center justify-between bg-white p-2 border border-slate-200 rounded-lg shadow-sm">
                      <a href={formData.first_atbf} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-sky-600 truncate max-w-[150px] underline">ATBF Attached ✓</a>
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
                              const url = await compressAndUpload(file, `tickets/${formData.id || 'edit'}/first_atbf`);
                              if (url) {
                                setFormData(prev => ({ ...prev, first_atbf: url }));
                              }
                            }
                          }}
                        />
                      </label>
                    </div>
                  )}
                </div>

                {/* Invoice Upload */}
                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">First Attempt Invoice</label>
                  {formData.first_invoice ? (
                    <div className="flex items-center justify-between bg-white p-2 border border-slate-200 rounded-lg shadow-sm">
                      <a href={formData.first_invoice} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-emerald-600 truncate max-w-[150px] underline">Invoice Attached ✓</a>
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, first_invoice: '' }))}
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
                              const url = await compressAndUpload(file, `tickets/${formData.id || 'edit'}/first_invoice`);
                              if (url) {
                                setFormData(prev => ({ ...prev, first_invoice: url }));
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
          </form>
        </div>

        <div className="p-6 border-t border-slate-200 bg-slate-50 flex items-center justify-between mt-auto">
          {draftSavedAt ? (
            <div className="inline-flex items-center gap-2 text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-lg">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Auto-saved draft ({draftSavedAt})</span>
              <button
                type="button"
                onClick={() => {
                  try { localStorage.removeItem(`draft_stage1_${ticket?.id}`); } catch (e) {}
                  setDraftSavedAt(null);
                  if (ticket) {
                    setFormData({
                      passenger_name: ticket.passenger_name || '',
                      pp_number: ticket.pp_number || '',
                      job_category: ticket.job_category || '',
                      ticket_type: ticket.ticket_type || 'ONE_WAY',
                      company: ticket.company || '',
                      project_id: ticket.project_id || '',
                      project_ids: ticket.project_ids || (ticket.project_id ? [ticket.project_id] : []) || [],
                      project_pos: ticket.project_pos || {},
                      po_number: ticket.po_number || '',
                      ticket_arranged_date: ticket.ticket_arranged_date || '',
                      approved_rate: ticket.approved_rate || 0,
                      currency: ticket.currency || 'USD',
                      travel_agent: ticket.travel_agent || '',
                      route: ticket.route || '',
                      first_atbf: ticket.first_atbf || '',
                      first_invoice: ticket.first_invoice || '',
                      subcontractor_entitlement_applied: ticket.subcontractor_entitlement_applied || false,
                    });
                  }
                  toast.success("Draft discarded");
                }}
                className="ml-2 text-slate-500 hover:text-red-600 font-semibold underline text-xs"
              >
                Discard Draft
              </button>
            </div>
          ) : <div />}
          <div className="flex space-x-3">
            <button type="button" onClick={onClose} className="px-5 py-2 text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 font-medium transition-colors">
              Cancel
            </button>
            <button type="submit" form="edit-ticket-form" disabled={loading} className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
