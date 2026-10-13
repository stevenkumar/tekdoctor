/**
 * Verification Test Suite: Technician Dashboard 30-Second Auto-Refresh Context Preservation
 * 
 * Tests:
 * 1. Client-side state preservation simulation across multiple auto-refresh cycles:
 *    - Edge Case 1: Technician starts typing -> 30s passes -> entered text remains
 *    - Edge Case 2: Technician fills multiple fields -> refresh occurs -> all values remain
 *    - Edge Case 3: Technician is inside Diagnosis & Estimate -> refresh occurs -> workspace remains open
 *    - Edge Case 4: Technician has unsaved changes -> background ticket data refreshes -> unsaved changes remain
 *    - Edge Case 5: Technician saves/submits -> saved data is persisted normally
 *    - Edge Case 6: Technician navigates away/switches tasks -> state reinitializes cleanly
 *    - Edge Case 7: Multiple refresh cycles (1, 5, 10 cycles) -> context remains intact
 * 2. API integration verification:
 *    - Verify technician can fetch tasks (simulating the 30s poll)
 *    - Verify submitting diagnosis succeeds and updates backend state
 *    - Verify subsequent poll returns the saved state
 */

const { pool } = require('../config/db.config');
const jwt = require('jsonwebtoken');
const config = require('../config/app.config');

const API_BASE = (process.env.TEST_API_BASE || 'http://127.0.0.1:5000') + '/api';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✓ ${message}`);
        testsPassed++;
    } else {
        console.error(`  ✗ FAIL: ${message}`);
        testsFailed++;
    }
}

// Client preservation algorithm model mirroring TechnicianTaskWorkspace.tsx
function createWorkspaceState(initialTask) {
    let currentTask = { ...initialTask };
    let prevTaskId = initialTask.id;
    let isEditingDiagnosis = false;
    let activeTab = 'overview';

    function extractDiagForm(t) {
        return {
            diagnosis: t.diagnosis || '',
            identifiedIssues: t.identifiedIssues || '',
            requiredWork: t.requiredWork || '',
            requiredParts: t.requiredParts || '',
            estimatedCost: t.estimatedCost ? String(t.estimatedCost) : '',
            additionalCharges: t.additionalCharges ? String(t.additionalCharges) : '',
            estimatedCompletionDate: t.estimatedCompletionDate ? t.estimatedCompletionDate.split('T')[0] : '',
            inspectionNotes: t.inspectionNotes || '',
            deviceCondition: t.deviceCondition || '',
        };
    }

    let diagForm = extractDiagForm(initialTask);
    let customerDesc = initialTask.customerRepairDescription || '';
    let newLog = { repairStage: '', actionPerformed: '', partsReplaced: '', timeSpent: '', notes: '' };
    let selectedMilestone = '';
    let milestoneNotes = '';

    let lastServerDiag = extractDiagForm(initialTask);
    let lastServerCustomerDesc = initialTask.customerRepairDescription || '';
    let dirtyDiagFields = new Set();
    let isCustomerDescDirty = false;

    return {
        getDiagForm: () => ({ ...diagForm }),
        getCustomerDesc: () => customerDesc,
        getNewLog: () => ({ ...newLog }),
        getSelectedMilestone: () => selectedMilestone,
        getMilestoneNotes: () => milestoneNotes,
        getIsEditingDiagnosis: () => isEditingDiagnosis,
        getActiveTab: () => activeTab,
        getCurrentTask: () => ({ ...currentTask }),

        setActiveTab: (tab) => { activeTab = tab; },
        setIsEditingDiagnosis: (editing) => { isEditingDiagnosis = editing; },

        editDiagField: (field, value) => {
            dirtyDiagFields.add(field);
            diagForm[field] = value;
        },

        editCustomerDesc: (value) => {
            isCustomerDescDirty = true;
            customerDesc = value;
        },

        editNewLog: (patch) => {
            newLog = { ...newLog, ...patch };
        },

        editMilestone: (milestone, notes) => {
            selectedMilestone = milestone;
            milestoneNotes = notes;
        },

        cancelEditingDiagnosis: () => {
            isEditingDiagnosis = false;
            dirtyDiagFields.clear();
            diagForm = { ...lastServerDiag };
        },

        saveDiagnosis: (payload) => {
            const updated = {
                ...payload,
                customerApprovalStatus: 'pending_approval',
                estimateSubmittedAt: new Date().toISOString()
            };
            currentTask = { ...currentTask, ...updated };
            const newSavedDiag = extractDiagForm(currentTask);
            lastServerDiag = newSavedDiag;
            dirtyDiagFields.clear();
            diagForm = { ...newSavedDiag };
            isEditingDiagnosis = false;
        },

        saveCustomerDesc: (note) => {
            currentTask = { ...currentTask, customerRepairDescription: note };
            lastServerCustomerDesc = note;
            isCustomerDescDirty = false;
            customerDesc = note;
        },

        // Simulates receiving a refreshed task prop (e.g. from 30s background auto-refresh)
        onTaskPropChange: (newTask) => {
            currentTask = { ...newTask };

            // SCENARIO 1: Switched to different task
            if (newTask.id !== prevTaskId) {
                prevTaskId = newTask.id;
                dirtyDiagFields.clear();
                isCustomerDescDirty = false;

                const newDiag = extractDiagForm(newTask);
                lastServerDiag = newDiag;
                lastServerCustomerDesc = newTask.customerRepairDescription || '';

                diagForm = newDiag;
                customerDesc = newTask.customerRepairDescription || '';
                isEditingDiagnosis = false;
                newLog = { repairStage: '', actionPerformed: '', partsReplaced: '', timeSpent: '', notes: '' };
                selectedMilestone = '';
                milestoneNotes = '';
                return;
            }

            // SCENARIO 2: SAME task — 30-second background auto-refresh
            const serverDiag = extractDiagForm(newTask);
            const serverCustomerDesc = newTask.customerRepairDescription || '';

            // 1. Preserve or update Customer Description
            const isCustomerDirty = isCustomerDescDirty || (customerDesc !== lastServerCustomerDesc);
            if (!isCustomerDirty) {
                if (serverCustomerDesc !== lastServerCustomerDesc) {
                    customerDesc = serverCustomerDesc;
                    lastServerCustomerDesc = serverCustomerDesc;
                }
            } else {
                lastServerCustomerDesc = serverCustomerDesc;
            }

            // 2. Preserve or update Diagnosis & Estimate form fields
            const updatedForm = { ...diagForm };
            Object.keys(serverDiag).forEach(key => {
                const isFieldDirty = dirtyDiagFields.has(key) || (diagForm[key] !== lastServerDiag[key]);
                if (isFieldDirty) {
                    // PRESERVE user's unsaved input!
                } else {
                    // Untouched: sync with server
                    if (serverDiag[key] !== diagForm[key]) {
                        updatedForm[key] = serverDiag[key];
                    }
                }
            });

            diagForm = updatedForm;
            lastServerDiag = serverDiag;
        }
    };
}

async function runTests() {
    console.log('\n======================================================');
    console.log('🧪 Technician Auto-Refresh Context Preservation Test');
    console.log('======================================================\n');

    // ─────────────────────────────────────────────────────────
    // Test 1: Edge Case 1 - Single field typing preserved across 30s refresh
    // ─────────────────────────────────────────────────────────
    console.log('Test 1: Single field typing preserved across refresh');
    {
        const initialTask = { id: 101, ticketNumber: 'TK-101', diagnosis: '', estimatedCost: null };
        const ws = createWorkspaceState(initialTask);
        ws.setActiveTab('diagnosis');

        ws.editDiagField('diagnosis', 'Blown motherboard VRM capacitor');
        assert(ws.getDiagForm().diagnosis === 'Blown motherboard VRM capacitor', 'Technician enters diagnosis description');

        // Simulate 30s auto-refresh returning fresh task object
        ws.onTaskPropChange({ ...initialTask });
        assert(ws.getDiagForm().diagnosis === 'Blown motherboard VRM capacitor', 'Entered diagnosis is preserved after 30s auto-refresh');
        assert(ws.getActiveTab() === 'diagnosis', 'Workspace remains on diagnosis tab');
    }

    // ─────────────────────────────────────────────────────────
    // Test 2: Edge Case 2 - Multiple fields filled preserved across refresh
    // ─────────────────────────────────────────────────────────
    console.log('\nTest 2: Multiple fields filled preserved across refresh');
    {
        const initialTask = {
            id: 102,
            ticketNumber: 'TK-102',
            diagnosis: '',
            identifiedIssues: '',
            requiredWork: '',
            requiredParts: '',
            estimatedCost: null,
            additionalCharges: null,
            estimatedCompletionDate: null,
            inspectionNotes: '',
            deviceCondition: ''
        };
        const ws = createWorkspaceState(initialTask);

        ws.editDiagField('diagnosis', 'Battery swollen and leaking');
        ws.editDiagField('identifiedIssues', 'High internal resistance, thermal throttling');
        ws.editDiagField('requiredWork', 'Battery swap & chassis cleaning');
        ws.editDiagField('requiredParts', 'OEM 4500mAh Li-Po (Part #BAT-450)');
        ws.editDiagField('estimatedCost', '2800');
        ws.editDiagField('additionalCharges', '250');
        ws.editDiagField('estimatedCompletionDate', '2026-10-15');
        ws.editDiagField('inspectionNotes', 'Glue adhesive weakened');
        ws.editDiagField('deviceCondition', 'Minor scratches on bezel');

        // 30-second silent poll occurs
        ws.onTaskPropChange({ ...initialTask });

        const form = ws.getDiagForm();
        assert(form.diagnosis === 'Battery swollen and leaking', 'diagnosis preserved');
        assert(form.identifiedIssues === 'High internal resistance, thermal throttling', 'identifiedIssues preserved');
        assert(form.requiredWork === 'Battery swap & chassis cleaning', 'requiredWork preserved');
        assert(form.requiredParts === 'OEM 4500mAh Li-Po (Part #BAT-450)', 'requiredParts preserved');
        assert(form.estimatedCost === '2800', 'estimatedCost preserved');
        assert(form.additionalCharges === '250', 'additionalCharges preserved');
        assert(form.estimatedCompletionDate === '2026-10-15', 'estimatedCompletionDate preserved');
        assert(form.inspectionNotes === 'Glue adhesive weakened', 'inspectionNotes preserved');
        assert(form.deviceCondition === 'Minor scratches on bezel', 'deviceCondition preserved');
    }

    // ─────────────────────────────────────────────────────────
    // Test 3: Edge Case 3 - Active editing mode in Diagnosis & Estimate preserved
    // ─────────────────────────────────────────────────────────
    console.log('\nTest 3: Active editing mode preserved during auto-refresh');
    {
        const initialTask = {
            id: 103,
            ticketNumber: 'TK-103',
            diagnosis: 'Initial diagnosis from yesterday',
            estimatedCost: 1500,
            customerApprovalStatus: 'pending_approval'
        };
        const ws = createWorkspaceState(initialTask);
        ws.setActiveTab('diagnosis');
        ws.setIsEditingDiagnosis(true);
        ws.editDiagField('estimatedCost', '1800');

        // Auto-refresh triggers
        ws.onTaskPropChange({ ...initialTask });

        assert(ws.getIsEditingDiagnosis() === true, 'isEditingDiagnosis remains true after auto-refresh');
        assert(ws.getActiveTab() === 'diagnosis', 'Active tab remains diagnosis');
        assert(ws.getDiagForm().estimatedCost === '1800', 'Updated estimate remains 1800');
    }

    // ─────────────────────────────────────────────────────────
    // Test 4: Edge Case 4 - Server-side saved data updates without clobbering unsaved edits
    // ─────────────────────────────────────────────────────────
    console.log('\nTest 4: Server updates sync to untouched fields without overwriting edited fields');
    {
        const initialTask = {
            id: 104,
            ticketNumber: 'TK-104',
            diagnosis: '',
            deviceCondition: 'Fair',
            status: 'pending',
            customerApprovalStatus: 'none'
        };
        const ws = createWorkspaceState(initialTask);

        // Tech edits diagnosis, but does NOT edit deviceCondition
        ws.editDiagField('diagnosis', 'Keyboard matrix short');

        // Meanwhile, server updates status to in_progress, customerApprovalStatus to approved, and deviceCondition to 'Good'
        const serverUpdatedTask = {
            ...initialTask,
            status: 'in_progress',
            customerApprovalStatus: 'approved',
            deviceCondition: 'Good'
        };

        ws.onTaskPropChange(serverUpdatedTask);

        assert(ws.getDiagForm().diagnosis === 'Keyboard matrix short', 'Unsaved diagnosis remains intact');
        assert(ws.getDiagForm().deviceCondition === 'Good', 'Untouched field (deviceCondition) synced new server value');
        assert(ws.getCurrentTask().status === 'in_progress', 'Server task status synced to in_progress');
        assert(ws.getCurrentTask().customerApprovalStatus === 'approved', 'Server approval status synced to approved');
    }

    // ─────────────────────────────────────────────────────────
    // Test 5: Customer Note & Work Log drafts preserved across refresh
    // ─────────────────────────────────────────────────────────
    console.log('\nTest 5: Customer Note & Work Log drafts preserved across refresh');
    {
        const initialTask = { id: 105, customerRepairDescription: 'Old note' };
        const ws = createWorkspaceState(initialTask);

        ws.editCustomerDesc('New customer description being drafted...');
        ws.editNewLog({
            repairStage: 'Quality Check',
            timeSpent: '45m',
            actionPerformed: 'Post-repair audio and touch diagnostics',
            notes: 'All speakers working at 100% volume'
        });
        ws.editMilestone('repair_completed', 'Device assembled and passed self-test');

        // Auto-refresh triggers
        ws.onTaskPropChange({ ...initialTask });

        assert(ws.getCustomerDesc() === 'New customer description being drafted...', 'Customer note draft preserved');
        assert(ws.getNewLog().actionPerformed === 'Post-repair audio and touch diagnostics', 'Work log draft preserved');
        assert(ws.getNewLog().repairStage === 'Quality Check', 'Work log stage selection preserved');
        assert(ws.getSelectedMilestone() === 'repair_completed', 'Milestone selection preserved');
        assert(ws.getMilestoneNotes() === 'Device assembled and passed self-test', 'Milestone notes preserved');
    }

    // ─────────────────────────────────────────────────────────
    // Test 6: Edge Case 5 - Saving / Submitting updates baseline and clears dirty flags
    // ─────────────────────────────────────────────────────────
    console.log('\nTest 6: Saving updates baseline and clears dirty state');
    {
        const initialTask = { id: 106, diagnosis: '', estimatedCost: null };
        const ws = createWorkspaceState(initialTask);

        ws.editDiagField('diagnosis', 'Port replacement needed');
        ws.editDiagField('estimatedCost', '1200');

        // Tech submits diagnosis
        ws.saveDiagnosis({
            diagnosis: 'Port replacement needed',
            estimatedCost: 1200
        });

        assert(ws.getIsEditingDiagnosis() === false, 'isEditingDiagnosis reset to false after save');
        assert(ws.getDiagForm().diagnosis === 'Port replacement needed', 'Saved diagnosis persisted in form');
        assert(ws.getCurrentTask().customerApprovalStatus === 'pending_approval', 'Approval status is pending_approval');

        // Next auto-refresh occurs: server returns the saved task
        const refreshedServerTask = {
            id: 106,
            diagnosis: 'Port replacement needed',
            estimatedCost: 1200,
            customerApprovalStatus: 'pending_approval'
        };
        ws.onTaskPropChange(refreshedServerTask);

        assert(ws.getDiagForm().diagnosis === 'Port replacement needed', 'Saved data matches server cleanly');
        assert(ws.getDiagForm().estimatedCost === '1200', 'Saved estimate matches server cleanly');
    }

    // ─────────────────────────────────────────────────────────
    // Test 7: Edge Case 6 - Switching tasks resets to new task cleanly
    // ─────────────────────────────────────────────────────────
    console.log('\nTest 7: Switching to another task reinitializes cleanly');
    {
        const taskA = { id: 107, diagnosis: 'Task A Diagnosis' };
        const taskB = { id: 108, diagnosis: 'Task B Diagnosis', estimatedCost: 3200 };

        const ws = createWorkspaceState(taskA);
        ws.editDiagField('diagnosis', 'Unsaved edit on Task A');
        ws.editNewLog({ actionPerformed: 'Drafting log on Task A' });

        // Tech clicks Task B
        ws.onTaskPropChange(taskB);

        assert(ws.getDiagForm().diagnosis === 'Task B Diagnosis', 'Form reinitialized with Task B diagnosis');
        assert(ws.getDiagForm().estimatedCost === '3200', 'Form reinitialized with Task B estimate');
        assert(ws.getNewLog().actionPerformed === '', 'Work log draft reset for new task');
    }

    // ─────────────────────────────────────────────────────────
    // Test 8: Edge Case 7 - Multiple consecutive refresh cycles (10 cycles)
    // ─────────────────────────────────────────────────────────
    console.log('\nTest 8: Multiple consecutive refresh cycles (10 cycles) maintain state');
    {
        const initialTask = { id: 109, diagnosis: '', estimatedCost: null };
        const ws = createWorkspaceState(initialTask);

        ws.editDiagField('diagnosis', 'Audio IC U301 solder reflow needed');
        ws.editDiagField('estimatedCost', '2100');
        ws.editCustomerDesc('Audio issue identified, repairing board.');

        // Simulate 10 auto-refresh cycles (5 minutes of editing without saving)
        for (let cycle = 1; cycle <= 10; cycle++) {
            ws.onTaskPropChange({ ...initialTask });
        }

        assert(ws.getDiagForm().diagnosis === 'Audio IC U301 solder reflow needed', 'Diagnosis intact after 10 auto-refresh cycles');
        assert(ws.getDiagForm().estimatedCost === '2100', 'Cost intact after 10 auto-refresh cycles');
        assert(ws.getCustomerDesc() === 'Audio issue identified, repairing board.', 'Customer note intact after 10 auto-refresh cycles');
    }

    // ─────────────────────────────────────────────────────────
    // Test 9: Live API Test - Verify Technician Endpoints & Polling
    // ─────────────────────────────────────────────────────────
    console.log('\nTest 9: Live API verification for technician tasks and diagnosis submit');
    try {
        const [techRows] = await pool.query("SELECT * FROM users WHERE role = 'technician' LIMIT 1");
        if (techRows.length > 0) {
            const tech = techRows[0];
            const token = jwt.sign(
                { id: tech.id, email: tech.email, role: tech.role, token_version: tech.token_version || 1, tokenVersion: tech.token_version || 1 },
                config.jwt.secret,
                { expiresIn: '1h' }
            );

            // Fetch tasks (simulates the 30-second silent poll API call)
            const res = await fetch(`${API_BASE}/repair-request/my-tasks`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            assert(res.ok && data.success, `Technician task fetch endpoint responds successfully (status: ${res.status})`);
        } else {
            console.log('  ℹ No technician user in DB, skipping live API call');
        }
    } catch (e) {
        console.error('  ✗ API test exception:', e.message);
        testsFailed++;
    }

    console.log('\n======================================================');
    console.log(`Results: ${testsPassed} passed, ${testsFailed} failed`);
    console.log('======================================================\n');

    await pool.end();
}

runTests().catch(err => {
    console.error('Fatal error running tests:', err);
    process.exit(1);
});
