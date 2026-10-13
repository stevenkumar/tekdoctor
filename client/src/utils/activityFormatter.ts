/**
 * Activity Log Formatter for TekDoctor Admin Dashboard
 * Converts raw action logs and JSON details into clean, human-readable presentations.
 */

export interface FormattedActivity {
    headline: string;
    description: string;
    parameters: Array<{ label: string; value: string }>;
    rawJson?: string;
    formattedTime: string;
    formattedDate: string;
}

/**
 * Safely parses detail data that may be JSON string, Object, or primitive
 */
export const parseActivityDetails = (details: any): Record<string, any> | null => {
    if (!details) return null;
    if (typeof details === 'object') return details;
    if (typeof details === 'string') {
        const trimmed = details.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            try {
                return JSON.parse(trimmed);
            } catch {
                return { text: details };
            }
        }
        return { text: details };
    }
    return { value: String(details) };
};

/**
 * Formats timestamps into human-readable date & time strings
 */
export const formatTimestamp = (dateInput: string | Date | number): { date: string; time: string; full: string } => {
    try {
        const d = new Date(dateInput);
        if (isNaN(d.getTime())) return { date: '—', time: '—', full: '—' };

        const date = d.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });

        const time = d.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });

        return { date, time, full: `${date}, ${time}` };
    } catch {
        return { date: '—', time: '—', full: '—' };
    }
};

/**
 * Humanizes an activity log into readable headline, description, and structured parameter badges
 */
export const formatActivity = (log: {
    action?: string | null;
    details?: any;
    actorName?: string | null;
    user_name?: string | null;
    user_email?: string | null;
    target_type?: string | null;
    targetType?: string | null;
    target_id?: string | number | null;
    targetId?: string | number | null;
    createdAt?: string | null;
    created_at?: string | null;
}): FormattedActivity => {
    const action = (log.action || '').toLowerCase().trim();
    const details = parseActivityDetails(log.details) || {};
    const actor = log.actorName || log.user_name || 'System';
    const timestamp = log.createdAt || log.created_at || new Date().toISOString();
    const { date: formattedDate, time: formattedTime } = formatTimestamp(timestamp);

    const targetType = log.targetType || log.target_type || '';
    const targetId = log.targetId || log.target_id || '';

    let headline: string;
    let description: string;
    const parameters: Array<{ label: string; value: string }> = [];

    // Extract ticket number or identifier if present
    const ticketNumber = details.ticketNumber || details.ticket_number || (targetType === 'service_requests' && targetId ? `#${targetId}` : '');
    const amount = details.amount != null ? `₹${Number(details.amount).toLocaleString('en-IN')}` : '';
    const status = details.status ? String(details.status).replace(/_/g, ' ') : '';

    switch (action) {
        case 'login':
            headline = `${actor} logged in`;
            description = `${actor} logged into the system`;
            break;

        case 'failed_login':
            headline = `Failed login attempt`;
            description = `Failed login attempt for ${details.email || actor}${details.reason ? ` (${details.reason.replace(/_/g, ' ')})` : ''}`;
            if (details.email) parameters.push({ label: 'Email', value: details.email });
            if (details.reason) parameters.push({ label: 'Reason', value: details.reason.replace(/_/g, ' ') });
            break;

        case 'registration':
            headline = `New user registered`;
            description = `Registered account for ${details.name || actor} (${details.role || 'user'})`;
            if (details.email) parameters.push({ label: 'Email', value: details.email });
            if (details.role) parameters.push({ label: 'Role', value: details.role });
            break;

        case 'password_change':
        case 'password_reset':
        case 'password_reset_completed':
            headline = `Password updated`;
            description = `${actor} changed account password`;
            break;

        case 'create_repair_request':
        case 'create_ticket':
            headline = `Created repair ticket ${ticketNumber ? ticketNumber : ''}`.trim();
            description = `${actor} submitted a new repair request${ticketNumber ? ` (${ticketNumber})` : ''}`;
            if (ticketNumber) parameters.push({ label: 'Ticket', value: ticketNumber });
            if (details.deviceCategory) parameters.push({ label: 'Device', value: details.deviceCategory });
            break;

        case 'update_status':
        case 'status_change':
            headline = `Updated status ${ticketNumber ? `for ${ticketNumber}` : ''}`.trim();
            description = `${actor} changed status to "${status || 'Updated'}"`;
            if (ticketNumber) parameters.push({ label: 'Ticket', value: ticketNumber });
            if (status) parameters.push({ label: 'New Status', value: status.toUpperCase() });
            break;

        case 'update_repair_request':
            headline = `Updated repair details ${ticketNumber ? `for ${ticketNumber}` : ''}`.trim();
            description = `${actor} updated ticket specifications`;
            if (ticketNumber) parameters.push({ label: 'Ticket', value: ticketNumber });
            if (details.brand) parameters.push({ label: 'Brand', value: details.brand });
            if (details.modelNumber) parameters.push({ label: 'Model', value: details.modelNumber });
            if (details.priority) parameters.push({ label: 'Priority', value: details.priority });
            break;

        case 'deactivate_repair_request':
        case 'cancel_repair_request':
            headline = `Deactivated ticket ${ticketNumber ? ticketNumber : ''}`.trim();
            description = `${actor} cancelled/deactivated repair ticket${details.reason ? `: "${details.reason}"` : ''}`;
            if (ticketNumber) parameters.push({ label: 'Ticket', value: ticketNumber });
            if (details.reason) parameters.push({ label: 'Reason', value: details.reason });
            break;

        case 'bulk_deactivate_repair_request':
            headline = `Bulk deleted ticket ${ticketNumber ? ticketNumber : ''}`.trim();
            description = `${actor} cancelled/deleted repair ticket in bulk operation${details.reason ? `: "${details.reason}"` : ''}`;
            if (ticketNumber) parameters.push({ label: 'Ticket', value: ticketNumber });
            if (details.reason) parameters.push({ label: 'Reason', value: details.reason });
            break;

        case 'reactivate_repair_request':
            headline = `Reactivated ticket ${ticketNumber ? ticketNumber : ''}`.trim();
            description = `${actor} reactivated repair ticket`;
            if (ticketNumber) parameters.push({ label: 'Ticket', value: ticketNumber });
            break;

        case 'accept_assignment':
            headline = `Accepted assignment ${ticketNumber ? `for ${ticketNumber}` : ''}`.trim();
            description = `${actor} accepted repair assignment`;
            if (ticketNumber) parameters.push({ label: 'Ticket', value: ticketNumber });
            break;

        case 'reject_assignment':
            headline = `Rejected assignment ${ticketNumber ? `for ${ticketNumber}` : ''}`.trim();
            description = `${actor} declined ticket assignment${details.reason ? `: "${details.reason}"` : ''}`;
            if (ticketNumber) parameters.push({ label: 'Ticket', value: ticketNumber });
            if (details.reason) parameters.push({ label: 'Reason', value: details.reason });
            break;

        case 'transfer_ticket':
            headline = `Transferred ticket ${ticketNumber ? ticketNumber : ''}`.trim();
            description = `${actor} reassigned ticket to another technician`;
            if (ticketNumber) parameters.push({ label: 'Ticket', value: ticketNumber });
            if (details.reason) parameters.push({ label: 'Reason', value: details.reason });
            break;

        case 'submit_feedback':
            headline = `Customer feedback received`;
            description = `Rating: ${details.rating || '—'} stars${details.comment ? ` — "${details.comment}"` : ''}`;
            if (details.rating) parameters.push({ label: 'Rating', value: `${details.rating} / 5` });
            if (details.comment) parameters.push({ label: 'Comment', value: details.comment });
            break;

        case 'payment_success':
            headline = `Payment received ${amount ? `(${amount})` : ''}`.trim();
            description = `Successfully processed ${amount || 'payment'} for ${ticketNumber || 'service'}`;
            if (amount) parameters.push({ label: 'Amount', value: amount });
            if (ticketNumber) parameters.push({ label: 'Ticket', value: ticketNumber });
            if (details.method) parameters.push({ label: 'Method', value: details.method });
            break;

        case 'create_invoice':
            headline = `Generated invoice ${amount ? `(${amount})` : ''}`.trim();
            description = `${actor} created an invoice for ${amount || 'services'}`;
            if (amount) parameters.push({ label: 'Amount', value: amount });
            if (details.invoiceNumber) parameters.push({ label: 'Invoice #', value: details.invoiceNumber });
            break;

        case 'pay_invoice':
            headline = `Invoice paid ${amount ? `(${amount})` : ''}`.trim();
            description = `Invoice marked as paid for ${amount || 'services'}`;
            if (amount) parameters.push({ label: 'Amount', value: amount });
            break;

        case 'create_quotation':
            headline = `Created quotation ${amount ? `(${amount})` : ''}`.trim();
            description = `${actor} prepared quotation for ${amount || 'services'}`;
            if (amount) parameters.push({ label: 'Amount', value: amount });
            break;

        case 'approve_quotation':
            headline = `Quotation approved`;
            description = `Quotation was approved`;
            break;

        case 'reject_quotation':
            headline = `Quotation rejected`;
            description = `Quotation was rejected`;
            break;

        case 'activate_technician':
            headline = `Activated technician ${details.name || ''}`.trim();
            description = `${actor} activated technician account`;
            if (details.name) parameters.push({ label: 'Technician', value: details.name });
            break;

        case 'deactivate_technician':
            headline = `Deactivated technician ${details.name || ''}`.trim();
            description = `${actor} deactivated technician account${details.reason ? `: "${details.reason}"` : ''}`;
            if (details.name) parameters.push({ label: 'Technician', value: details.name });
            if (details.reason) parameters.push({ label: 'Reason', value: details.reason });
            break;

        case 'bulk_update_ticket':
            headline = `Bulk updated tickets`;
            description = `${actor} updated multiple tickets`;
            if (status) parameters.push({ label: 'Status', value: status.toUpperCase() });
            break;

        default: {
            const prettyAction = action.replace(/_/g, ' ');
            const capitalized = prettyAction.charAt(0).toUpperCase() + prettyAction.slice(1);
            headline = `${actor}: ${capitalized}`;
            
            // Build fallback from any available key-value pairs
            const entries = Object.entries(details).filter(([k]) => !['timestamp', 'action'].includes(k));
            if (entries.length > 0) {
                description = entries.map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ');
                for (const [k, v] of entries.slice(0, 4)) {
                    parameters.push({
                        label: k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim(),
                        value: typeof v === 'object' ? JSON.stringify(v) : String(v)
                    });
                }
            } else {
                description = `Action performed on ${targetType || 'system'} ${targetId ? `#${targetId}` : ''}`.trim();
            }
            break;
        }
    }

    // Populate any remaining fields from details into parameters if none were captured
    if (parameters.length === 0 && Object.keys(details).length > 0) {
        for (const [key, val] of Object.entries(details)) {
            if (['action', 'timestamp', 'user'].includes(key)) continue;
            parameters.push({
                label: key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim(),
                value: typeof val === 'object' ? JSON.stringify(val) : String(val)
            });
        }
    }

    let rawJson: string | undefined;
    try {
        if (log.details) {
            rawJson = JSON.stringify(typeof log.details === 'string' ? JSON.parse(log.details) : log.details, null, 2);
        }
    } catch {
        rawJson = String(log.details);
    }

    return {
        headline,
        description: description || headline,
        parameters,
        rawJson,
        formattedTime,
        formattedDate
    };
};
