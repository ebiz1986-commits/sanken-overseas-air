// Subcontractor ticket-entitlement calculation.
//
// Deduction model: one ticket = one "visit" = a total of ONE slot, split evenly
// across the projects the ticket is linked to. A ticket on projects [A, B]
// therefore deducts 0.5 from A and 0.5 from B (total 1). A single-project ticket
// deducts a full 1.
//
// The form validates EVERY selected project, so exceeding any one project's
// allowance is surfaced (not just the primary project).

export interface ProjectEntitlement {
  projectId: string;
  projectName: string;
  cycle: string;
  periodMonths: number;
  startDateStr: string;
  initial: number;
  previouslyApplied: number; // fractional sum of prior visits' shares
  batchWeight: number;       // fractional deduction this batch adds to this project
  remainingBefore: number;
  remainingAfter: number;
  isExceeded: boolean;
  exceedBy: number;
  isExpired: boolean;
  expirationWarningStr: string;
}

export interface EntitlementResult {
  list: ProjectEntitlement[];
  anyExceeded: boolean;
  anyExpired: boolean;
  totalExceedBy: number;
}

/** Number of projects a ticket's single slot is split across (min 1). */
function projectCountOf(t: any): number {
  if (Array.isArray(t.project_ids) && t.project_ids.length > 0) return t.project_ids.length;
  return 1;
}

/** Format a possibly-fractional slot count for display (e.g. 0.5, 7, 3.33). */
export function fmtSlots(n: number): string {
  const r = Math.round(n * 100) / 100;
  return String(r);
}

function computeOne(
  targetProjectId: string,
  company: string,
  selectedCount: number,
  batchCount: number,
  loadedTickets: any[],
  proj: any,
  excludeTicketId?: string,
): ProjectEntitlement {
  const cycles = proj.company_entitlement_cycles || {};
  const periods = proj.company_entitlement_periods || {};
  const starts = proj.company_entitlement_starts || {};

  const cycle = cycles[company] || 'PROJECT_PERIOD';
  const periodMonths = parseInt(String(periods[company] || '12')) || 12;
  const startDateStr = starts[company] || '';

  let initial = 0;
  const companyEnts = proj.company_entitlements || {};
  if (company && companyEnts[company] !== undefined) {
    initial = parseInt(String(companyEnts[company])) || 0;
  } else {
    initial = parseInt(proj.entitlement_total) || 0;
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  let previouslyApplied = 0;
  for (const t of loadedTickets) {
    const isApplied = !!t.subcontractor_entitlement_applied;
    const matchesProject = t.project_id === targetProjectId || (Array.isArray(t.project_ids) && t.project_ids.includes(targetProjectId));
    const matchesCompany = String(t.company || '').trim().toLowerCase() === company.trim().toLowerCase();
    const isNotCurrent = excludeTicketId ? t.id !== excludeTicketId : true;
    if (!isApplied || !matchesProject || !matchesCompany || !isNotCurrent) continue;

    if (cycle === 'MONTHLY') {
      const dateStr = t.ticket_arranged_date || t.created_at || t.departure_date;
      if (!dateStr) continue;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) continue;
      if (!(d.getFullYear() === currentYear && d.getMonth() === currentMonth)) continue;
    }
    // Split each prior ticket's single slot across the projects it covers.
    previouslyApplied += 1 / projectCountOf(t);
  }

  // Each new ticket in this batch contributes 1 / (projects on the ticket) to this project.
  const batchWeight = batchCount * (1 / Math.max(1, selectedCount));
  const remainingBefore = initial - previouslyApplied;
  const remainingAfter = remainingBefore - batchWeight;
  const isExceeded = remainingAfter < -1e-6;
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
      console.error('Error evaluating expiry:', err);
    }
  }

  return {
    projectId: targetProjectId,
    projectName: proj.name || targetProjectId,
    cycle, periodMonths, startDateStr,
    initial, previouslyApplied, batchWeight,
    remainingBefore, remainingAfter, isExceeded, exceedBy,
    isExpired, expirationWarningStr,
  };
}

/**
 * Compute the entitlement balance for every project a ticket is linked to.
 * Returns null when company or projects are not selected.
 */
export function computeEntitlements(opts: {
  company: string;
  selectedProjectIds: string[];
  batchCount: number;
  loadedTickets: any[];
  projects: any[];
  excludeTicketId?: string;
}): EntitlementResult | null {
  const { company, selectedProjectIds, batchCount, loadedTickets, projects, excludeTicketId } = opts;
  if (!company || !selectedProjectIds || selectedProjectIds.length === 0) return null;

  const selectedCount = selectedProjectIds.length;
  const list: ProjectEntitlement[] = [];
  for (const pid of selectedProjectIds) {
    const proj = projects.find((p: any) => p.id === pid);
    if (!proj) continue;
    list.push(computeOne(pid, company, selectedCount, batchCount, loadedTickets, proj, excludeTicketId));
  }
  if (list.length === 0) return null;

  return {
    list,
    anyExceeded: list.some(e => e.isExceeded),
    anyExpired: list.some(e => e.isExpired),
    totalExceedBy: list.reduce((s, e) => s + e.exceedBy, 0),
  };
}
