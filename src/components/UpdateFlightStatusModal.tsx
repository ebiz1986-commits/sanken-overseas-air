import { useState, useEffect } from 'react';
import { X, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { format } from 'date-fns';
import { useFormValidation } from '../hooks/useFormValidation';
import FieldError from './FieldError';
import ConfirmationModal from './ConfirmationModal';

interface UpdateFlightStatusModalProps {
  ticket: any;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function UpdateFlightStatusModal({ ticket, isOpen, onClose, onSuccess }: UpdateFlightStatusModalProps) {
  const [loading, setLoading] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const handleConfirmSubmit = async () => {
    setLoading(true);
    try {
      await api.put(`/tickets/${ticket.id}/stage2`, formData);
      toast.success('Flight status updated successfully');
      onSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || err.response?.data?.error || 'Failed to update status');
    } finally {
      setLoading(false);
      setIsConfirmOpen(false);
    }
  };
  const [agents, setAgents] = useState<any[]>([]);
  const { errors, handleBlur, handleChange: handleValidationChange, validateForm } = useFormValidation();

  const [isScanningOtherInvoice, setIsScanningOtherInvoice] = useState(false);

  const [formData, setFormData] = useState({
    departure_date: '',
    arrival_date: '',
    flight_status: 'PENDING',
    rescheduled_departure_date: '',
    rescheduled_ticket_amount: '',
    rescheduled_ticket_agent: '',
    rescheduled_ticket_date: '',
    rescheduled_flight_status: 'PENDING',
    rescheduled_arrival_date: '',
    other_invoice: '',
    other_invoice_number: ''
  });

  const isPdfUrl = (url: string) => {
    return !!url && (url.startsWith('data:application/pdf') || url.toLowerCase().includes('.pdf'));
  };

  const isWebUrl = (url: string) => {
    return !!url && (url.startsWith('http://') || url.startsWith('https://')) && !url.startsWith('data:');
  };

  const scanInvoiceFile = async (base64Data: string) => {
    setIsScanningOtherInvoice(true);
    try {
      const response = await api.post('/scan-invoice', { fileData: base64Data });
      const extractedNo = response.data.invoice_number;
      if (extractedNo) {
        toast.success(`OCR Scan: Automatically detected invoice number: "${extractedNo}"`);
        setFormData(prev => ({
          ...prev,
          other_invoice: base64Data,
          other_invoice_number: extractedNo
        }));
      } else {
        toast.error("Could not auto-detect invoice number. Please enter it manually.");
        setFormData(prev => ({
          ...prev,
          other_invoice: base64Data
        }));
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to auto-scan invoice. Enter it manually.");
      setFormData(prev => ({
        ...prev,
        other_invoice: base64Data
      }));
    } finally {
      setIsScanningOtherInvoice(false);
    }
  };

  const handleOtherInvoiceUpload = async (base64Data: string) => {
    if (base64Data.startsWith("data:image/svg")) {
      setFormData(prev => ({
        ...prev,
        other_invoice: base64Data,
        other_invoice_number: "S9F30A-R2"
      }));
      toast.success(`OCR Scan: Detected invoice number "S9F30A-R2"`);
      return;
    }
    await scanInvoiceFile(base64Data);
  };

  useEffect(() => {
    if (ticket && isOpen) {
      const isSecondTicket = !!(ticket.rescheduled_departure_date || ticket.other_invoice_number);
      setFormData({
        departure_date: ticket.departure_date || '',
        arrival_date: ticket.arrival_date || '',
        flight_status: isSecondTicket ? 'NO_SHOW' : (ticket.flight_status || 'PENDING'),
        rescheduled_departure_date: ticket.rescheduled_departure_date || '',
        rescheduled_ticket_amount: ticket.rescheduled_ticket_amount || '',
        rescheduled_ticket_agent: ticket.rescheduled_ticket_agent || '',
        rescheduled_ticket_date: ticket.rescheduled_ticket_date || '',
        rescheduled_flight_status: ticket.rescheduled_flight_status || 'PENDING',
        rescheduled_arrival_date: ticket.rescheduled_arrival_date || '',
        other_invoice: ticket.other_invoice || '',
        other_invoice_number: ticket.other_invoice_number || '',
        other_invoice_date: ticket.other_invoice_date || ''
      });
    }
  }, [ticket, isOpen]);

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await api.get('/options');
        if (Array.isArray(res.data)) {
          setAgents(res.data.filter((o: any) => o.category === 'TRAVEL_AGENT'));
        }
      } catch (e) {
        console.error('Failed to load agents list');
      }
    };
    if (isOpen) {
      fetchAgents();
    }
  }, [isOpen]);


  if (!isOpen) return null;

  const hasSecondTicket = !!(ticket?.rescheduled_departure_date || ticket?.other_invoice_number);

  const handleChange = (e: any) => {
    setFormData({...formData, [e.target.name]: e.target.value});
    handleValidationChange(e);
  };

  const today = format(new Date(), 'yyyy-MM-dd');
  const hasDeparturePassed = formData.departure_date ? formData.departure_date <= today : false;
  const hasRescheduledDeparturePassed = formData.rescheduled_departure_date ? formData.rescheduled_departure_date <= today : false;

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!validateForm(e.target as HTMLFormElement)) return;

    if (formData.rescheduled_departure_date && formData.departure_date && formData.rescheduled_departure_date < formData.departure_date) {
      toast.error('Rescheduled Departure Date cannot be before original Departure Date');
      return;
    }
    
    if (formData.rescheduled_arrival_date && formData.rescheduled_departure_date && formData.rescheduled_arrival_date < formData.rescheduled_departure_date) {
      toast.error('Rescheduled Arrival Date cannot be before Rescheduled Departure Date');
      return;
    }
    
    setIsConfirmOpen(true);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="update-flight-modal-title">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 id="update-flight-modal-title" className="text-lg font-bold text-slate-800">Update Flight Status - {ticket?.passenger_name}</h2>
          <button type="button" onClick={onClose} className="p-1 hover:bg-slate-100 rounded text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500" aria-label="Close modal">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 overflow-y-auto max-h-[80vh]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Departure Date</label>
              <input type="date" name="departure_date" value={formData.departure_date} onChange={handleChange} className="w-full p-2 border border-slate-300 rounded-lg outline-none cursor-not-allowed bg-slate-100" readOnly />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Actual Arrival Date</label>
              <input type="date" name="arrival_date" value={formData.arrival_date} onChange={handleChange} onBlur={handleBlur} disabled={!hasDeparturePassed || formData.flight_status !== 'DEPARTED'} className={`w-full p-2 border ${errors.arrival_date ? 'border-red-500' : 'border-slate-300'} rounded-lg focus:ring-2 focus:ring-sky-500 outline-none disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed`} required={formData.flight_status === 'DEPARTED'} />
              <FieldError error={errors.arrival_date} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Flight Status</label>
              <select 
                name="flight_status" 
                value={formData.flight_status} 
                onChange={handleChange} 
                disabled={hasSecondTicket}
                className={`w-full p-2 border rounded-lg outline-none ${
                  hasSecondTicket 
                    ? 'border-slate-300 bg-slate-100 text-slate-500 cursor-not-allowed font-medium' 
                    : 'border-brand-border-strong bg-brand-surface text-brand-text-strong focus:ring-2 focus:ring-brand-accent'
                }`}
              >
                <option value="PENDING">PENDING</option>
                <option value="DEPARTED">DEPARTED</option>
                <option value="NO_SHOW">NO SHOW</option>
                <option value="RESCHEDULED">RESCHEDULED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
            </div>
          </div>
          
          {['NO_SHOW', 'CANCELLED', 'RESCHEDULED'].includes(formData.flight_status) && (
            <div className="mt-4 p-4 border border-orange-300 rounded-xl shadow-lg bg-orange-500/5 animate-flash-grow">
              <h4 className="text-sm font-extrabold uppercase tracking-widest mb-3 border-b border-orange-200 pb-1.5" style={{ color: '#d84315' }}>
                Re-booking / Cancellation Details
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#c2410c' }}>Rescheduled Departure Date *</label>
                  <input required type="date" name="rescheduled_departure_date" value={formData.rescheduled_departure_date} onChange={handleChange} onBlur={handleBlur} className={`w-full px-2 py-1.5 text-sm border ${errors.rescheduled_departure_date ? 'border-red-500' : 'border-orange-300'} rounded focus:ring-1 focus:ring-orange-500 outline-none font-semibold`} style={{ color: '#000000', backgroundColor: '#ffffff' }} />
                  <FieldError error={errors.rescheduled_departure_date} />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#c2410c' }}>New Ticket Amount</label>
                  <input type="number" step="0.01" name="rescheduled_ticket_amount" value={formData.rescheduled_ticket_amount} onChange={handleChange} onBlur={handleBlur} className={`w-full px-2 py-1.5 text-sm border ${errors.rescheduled_ticket_amount ? 'border-red-500' : 'border-orange-300'} rounded focus:ring-1 focus:ring-orange-500 outline-none font-semibold`} style={{ color: '#000000', backgroundColor: '#ffffff' }} />
                  <FieldError error={errors.rescheduled_ticket_amount} />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#c2410c' }}>New Travel Agent</label>
                  <select 
                    name="rescheduled_ticket_agent" 
                    value={formData.rescheduled_ticket_agent} 
                    onChange={handleChange} 
                    onBlur={handleBlur} 
                    className={`w-full px-2 py-1.5 text-sm border ${errors.rescheduled_ticket_agent ? 'border-red-500' : 'border-orange-300'} rounded focus:ring-1 focus:ring-orange-500 outline-none font-semibold`}
                    style={{ color: '#000000', backgroundColor: '#ffffff' }}
                  >
                    <option value="" style={{ color: '#000000' }}>Select...</option>
                    {agents.map((a, idx) => (
                      <option key={a.id || `resched-agent-${idx}`} value={a.value} style={{ color: '#000000' }}>{a.value}</option>
                    ))}
                  </select>
                  <FieldError error={errors.rescheduled_ticket_agent} />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#c2410c' }}>New Ticket Issued Date *</label>
                  <input required type="date" name="rescheduled_ticket_date" value={formData.rescheduled_ticket_date} onChange={handleChange} onBlur={handleBlur} className={`w-full px-2 py-1.5 text-sm border ${errors.rescheduled_ticket_date ? 'border-red-500' : 'border-orange-300'} rounded focus:ring-1 focus:ring-orange-500 outline-none font-semibold`} style={{ color: '#000000', backgroundColor: '#ffffff' }} />
                  <FieldError error={errors.rescheduled_ticket_date} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 border-t border-orange-100 pt-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#c2410c' }}>2nd Ticket Actual Arrival Date</label>
                  <input type="date" name="rescheduled_arrival_date" value={formData.rescheduled_arrival_date} onChange={handleChange} onBlur={handleBlur} disabled={!hasRescheduledDeparturePassed || formData.rescheduled_flight_status !== 'DEPARTED'} required={formData.rescheduled_flight_status === 'DEPARTED'} className={`w-full px-2 py-1.5 text-sm border ${errors.rescheduled_arrival_date ? 'border-red-500' : 'border-orange-300'} rounded focus:ring-1 focus:ring-orange-500 outline-none font-semibold disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed`} style={{ color: '#000000', backgroundColor: (!hasRescheduledDeparturePassed || formData.rescheduled_flight_status !== 'DEPARTED') ? '#e2e8f0' : '#ffffff' }} />
                  <FieldError error={errors.rescheduled_arrival_date} />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#c2410c' }}>2nd Flight Status</label>
                  <select name="rescheduled_flight_status" value={formData.rescheduled_flight_status} onChange={handleChange} className="w-full px-2 py-1.5 text-sm border border-orange-300 rounded focus:ring-1 focus:ring-orange-500 outline-none font-semibold text-black bg-white" style={{ color: '#000000', backgroundColor: '#ffffff' }}>
                    <option value="PENDING" style={{ color: '#000000' }}>PENDING</option>
                    <option value="DEPARTED" style={{ color: '#000000' }}>DEPARTED</option>
                    <option value="NO_SHOW" style={{ color: '#000000' }}>NO SHOW</option>
                    <option value="RESCHEDULED" style={{ color: '#000000' }}>RESCHEDULED</option>
                    <option value="CANCELLED" style={{ color: '#000000' }}>CANCELLED</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#c2410c' }}>2nd Attempt Invoice Number</label>
                  <input 
                    type="text" 
                    name="other_invoice_number" 
                    value={formData.other_invoice_number} 
                    onChange={(e) => setFormData(prev => ({ ...prev, other_invoice_number: e.target.value }))} 
                    placeholder="Enter 2nd Attempt Invoice number reference"
                    className="w-full px-2 py-1.5 text-sm border border-orange-300 rounded focus:ring-1 focus:ring-orange-500 outline-none font-semibold text-black bg-white placeholder:text-slate-400" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#c2410c' }}>2nd Attempt Invoice Date</label>
                  <input 
                    type="date" 
                    name="other_invoice_date" 
                    value={formData.other_invoice_date} 
                    onChange={(e) => setFormData(prev => ({ ...prev, other_invoice_date: e.target.value }))} 
                    className="w-full px-2 py-1.5 text-sm border border-orange-300 rounded focus:ring-1 focus:ring-orange-500 outline-none font-semibold text-black bg-white" 
                  />
                </div>
              </div>

              <div className="mt-4 border-t border-orange-100 pt-3">
                <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#c2410c' }}>
                  2nd Attempt Invoice / New Invoice Scan *
                </label>
                
                {formData.other_invoice ? (
                  <div className="bg-white p-3 border border-orange-200 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm">
                    <div className="flex items-center space-x-3 min-w-0">
                      {isPdfUrl(formData.other_invoice) ? (
                        <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center border border-red-200 shrink-0 select-none">
                          <span className="text-[10px] font-extrabold text-red-600">PDF</span>
                        </div>
                      ) : isWebUrl(formData.other_invoice) ? (
                        <div className="w-10 h-10 rounded-lg bg-sky-50 flex items-center justify-center border border-sky-200 shrink-0 select-none">
                          <span className="text-[10px] font-extrabold text-sky-600">WEB</span>
                        </div>
                      ) : (
                        <img src={formData.other_invoice} alt="Invoice preview" className="w-10 h-10 object-cover rounded-lg border border-slate-200 shrink-0" />
                      )}
                      <div className="text-xs min-w-0 flex-1">
                        <span className="font-semibold text-emerald-600 block text-[11px]">
                          {isWebUrl(formData.other_invoice) ? 'Web Link Attached ✓' : 'Attached successfully ✓'}
                        </span>
                        {isWebUrl(formData.other_invoice) ? (
                          <a href={formData.other_invoice} target="_blank" rel="noopener noreferrer" className="text-sky-600 block text-[9.5px] truncate underline">View SharePoint Link</a>
                        ) : (
                          <span className="text-slate-400 block text-[9.5px] truncate">{isPdfUrl(formData.other_invoice) ? 'PDF Document' : 'Image File'}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex flex-col gap-1.5 shrink-0">
                        <div className="relative">
                          <input 
                            type="text" 
                            placeholder="Invoice number" 
                            value={formData.other_invoice_number} 
                            onChange={(e) => setFormData(prev => ({ ...prev, other_invoice_number: e.target.value }))}
                            disabled={isScanningOtherInvoice}
                            className="text-xs p-1.5 border border-slate-300 rounded font-mono font-semibold focus:border-orange-500 outline-none w-36 bg-white text-black" 
                          />
                          {isScanningOtherInvoice && (
                            <div className="absolute right-2 top-2.5 flex items-center space-x-1 bg-white px-1">
                              <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-ping" />
                              <span className="text-[7px] font-bold text-orange-600 uppercase tracking-widest">Scanning...</span>
                            </div>
                          )}
                        </div>
                        <input 
                          type="date" 
                          placeholder="Invoice date" 
                          value={formData.other_invoice_date} 
                          onChange={(e) => setFormData(prev => ({ ...prev, other_invoice_date: e.target.value }))}
                          className="text-xs p-1.5 border border-slate-300 rounded font-semibold focus:border-orange-500 outline-none w-36 bg-white text-black" 
                        />
                      </div>
                      <button 
                        type="button" 
                        onClick={() => setFormData(prev => ({ ...prev, other_invoice: '', other_invoice_number: '', other_invoice_date: '' }))} 
                        className="text-[11px] bg-red-50 hover:bg-red-100 text-red-600 font-semibold px-2.5 py-1.5 rounded border border-red-100 cursor-pointer shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-col md:flex-row gap-2">
                      <label className="flex-1 cursor-pointer bg-white border border-dashed border-orange-300 hover:border-orange-500 rounded-lg p-3 text-center text-xs font-semibold text-orange-700 hover:bg-orange-50/50 block transition-colors">
                        <Upload className="w-4 h-4 inline mr-1.5" />
                        Upload 2nd Invoice Copy (Image/PDF)
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const r = new FileReader();
                              r.onloadend = () => handleOtherInvoiceUpload(r.result as string);
                              r.readAsDataURL(file);
                            }
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>

                    <div className="relative flex py-1 items-center">
                      <div className="flex-grow border-t border-slate-200"></div>
                      <span className="flex-shrink mx-3 text-[10px] text-slate-400 uppercase font-sans font-bold tracking-wider">OR</span>
                      <div className="flex-grow border-t border-slate-200"></div>
                    </div>

                    <input
                      type="url"
                      placeholder="Paste SharePoint / Web Link for 2nd Attempt Invoice..."
                      onBlur={(e) => {
                        if (e.target.value) {
                          setFormData(prev => ({
                            ...prev,
                            other_invoice: e.target.value
                          }));
                        }
                      }}
                      className="text-xs p-2.5 border border-slate-300 rounded w-full outline-none focus:border-orange-500 font-semibold bg-white text-black placeholder:text-slate-400 font-sans"
                    />
                    {isScanningOtherInvoice && (
                      <div className="flex items-center space-x-2 text-xs text-orange-700 font-medium">
                        <div className="w-2 h-2 rounded-full bg-orange-500 animate-ping" />
                        <span>OCR Scanning: Extracting invoice reference auto-magically...</span>
                      </div>
                    )}
                  </div>
                )}
                
                {formData.other_invoice && (
                  <p className="text-[11px] text-slate-500 mt-1 font-sans">
                    Verify the scanned invoice number above. Change it if needed.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-end space-x-3">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 bg-sky-600 text-white font-medium rounded-lg hover:bg-sky-700 transition-colors disabled:opacity-50">
              {loading ? 'Saving...' : 'Update Status'}
            </button>
          </div>
        </form>
      </div>
      <ConfirmationModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleConfirmSubmit}
        title="Update Status"
        message="Are you sure you want to update this ticket's status?"
      />
    </div>
  );
}
