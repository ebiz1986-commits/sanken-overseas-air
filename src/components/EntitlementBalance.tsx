import { AlertCircle } from 'lucide-react';
import { EntitlementResult, fmtSlots } from '../lib/entitlement';

interface Props {
  entitlements: EntitlementResult;
  company: string;
}

/**
 * Renders the subcontractor entitlement balance for every project the ticket is
 * linked to. A multi-project ticket splits one slot across projects, so each
 * project shows its own fractional share and its own exceeded/expired warning.
 */
export default function EntitlementBalance({ entitlements, company }: Props) {
  const multi = entitlements.list.length > 1;

  return (
    <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-3xs space-y-3">
      {multi && (
        <div className="text-[11px] bg-sky-50 border border-sky-100 text-sky-700 rounded p-1.5 font-medium">
          This ticket covers <strong>{entitlements.list.length} projects</strong>, so one slot is split evenly
          (<strong>{fmtSlots(1 / entitlements.list.length)}</strong> per project). Each project is checked below.
        </div>
      )}

      {entitlements.list.map((e) => (
        <div key={e.projectId} className="space-y-2 border-b border-slate-100 last:border-b-0 pb-2 last:pb-0">
          <div className="flex justify-between items-center text-slate-500">
            <span className="font-semibold text-slate-700 truncate">{e.projectName}</span>
            <span className="font-mono bg-sky-50 text-sky-700 border border-sky-200 px-2 py-0.5 rounded text-[10px] uppercase font-bold shrink-0 ml-2">
              {e.cycle === 'MONTHLY' ? '🗓️ Monthly Reset' : `🏗️ Project Period (${e.periodMonths}M)`}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 font-medium">
            Company: <strong className="text-slate-700">{company}</strong>
            {e.cycle === 'PROJECT_PERIOD' && e.startDateStr && (
              <span className="ml-2">• Starts: <strong className="text-slate-700">{e.startDateStr}</strong></span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-slate-600 font-mono">
            <div className="bg-slate-50 p-1.5 rounded">
              <p className="text-[10px] text-slate-400 font-sans uppercase font-medium">Total Initial</p>
              <p className="text-sm font-extrabold text-slate-800">{fmtSlots(e.initial)}</p>
            </div>
            <div className="bg-slate-50 p-1.5 rounded">
              <p className="text-[10px] text-slate-400 font-sans uppercase font-medium">
                {e.cycle === 'MONTHLY' ? 'Used This Month' : 'Previously Used'}
              </p>
              <p className="text-sm font-extrabold text-amber-600">{fmtSlots(e.previouslyApplied)}</p>
            </div>
            <div className="bg-slate-50 p-1.5 rounded">
              <p className="text-[10px] text-slate-400 font-sans uppercase font-medium">This Ticket</p>
              <p className="text-sm font-extrabold text-sky-600">{fmtSlots(e.batchWeight)}</p>
            </div>
            <div className={`p-1.5 rounded ${e.isExceeded ? 'bg-rose-50 border border-rose-100' : 'bg-emerald-50 border border-emerald-100'}`}>
              <p className="text-[10px] text-slate-400 font-sans uppercase font-medium">Net Remaining</p>
              <p className={`text-sm font-extrabold ${e.isExceeded ? 'text-rose-600' : 'text-emerald-600'}`}>
                {fmtSlots(e.remainingAfter)}
              </p>
            </div>
          </div>

          {e.isExpired && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg flex items-start gap-2 leading-relaxed">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 animate-pulse" />
              <div>
                <p className="font-bold text-xs">⚠️ Entitlement Period Expired!</p>
                <p className="text-[11px] text-amber-700">{e.expirationWarningStr}</p>
              </div>
            </div>
          )}

          {e.isExceeded ? (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-start gap-2 leading-relaxed">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 animate-bounce" />
              <div>
                <p className="font-bold">🚨 Entitlement Limit Exceeded ({e.projectName})</p>
                <p className="text-[11px] text-rose-600">
                  This exceeds the agreed limit of <strong>{fmtSlots(e.initial)}</strong> for this project. It will be
                  recorded as <strong>exceeded by {fmtSlots(e.exceedBy)}</strong> slot(s).
                </p>
              </div>
            </div>
          ) : (
            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100 flex items-center gap-2 font-medium">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
              <span>Within allowance — {fmtSlots(e.remainingAfter)} slot(s) left after this ticket.</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
