const { pool } = require('../config/db.config');
const { formatResponse } = require('../utils/helpers');
const amcService = require('../services/amc.service');

// Helper to get company ID from authenticated user
const getCompanyIdFromReq = (req) => {
  if (req.user && req.user.role === 'company') {
    return req.user.id;
  }
  // Admin impersonation or explicit companyId parameter
  if (req.user && req.user.role === 'admin' && req.query.companyId) {
    return req.query.companyId;
  }
  return null;
};

// ── Overview ────────────────────────────────────────────────────────────

const getAdminOverview = async (req, res, next) => {
  try {
    const stats = await amcService.getAdminOverview();
    return res.json(formatResponse(true, 'Admin AMC overview retrieved successfully.', stats));
  } catch (error) {
    next(error);
  }
};

// ── Plans ───────────────────────────────────────────────────────────────

const getPublicPlans = async (req, res, next) => {
  try {
    const plans = await amcService.getPlans({ isActiveOnly: true });
    return res.json(formatResponse(true, 'Active AMC plans retrieved successfully.', plans));
  } catch (error) {
    next(error);
  }
};

const getAdminPlans = async (req, res, next) => {
  try {
    const plans = await amcService.getPlans({ isActiveOnly: false });
    return res.json(formatResponse(true, 'All AMC plans retrieved successfully.', plans));
  } catch (error) {
    next(error);
  }
};

const createPlan = async (req, res, next) => {
  try {
    const { planCode, name, description, basePrice, durationMonths, defaultDeviceCapacity, coverageTerms } = req.body;
    if (!planCode || !name || !basePrice) {
      return res.status(400).json(formatResponse(false, 'planCode, name, and basePrice are required.'));
    }
    const result = await amcService.createPlan({
      planCode,
      name,
      description,
      basePrice,
      durationMonths,
      defaultDeviceCapacity,
      coverageTerms
    });
    return res.status(201).json(formatResponse(true, 'AMC plan created successfully.', result));
  } catch (error) {
    next(error);
  }
};

const updatePlan = async (req, res, next) => {
  try {
    const result = await amcService.updatePlan(req.params.id, req.body);
    return res.json(formatResponse(true, 'AMC plan updated successfully.', result));
  } catch (error) {
    next(error);
  }
};

const togglePlanStatus = async (req, res, next) => {
  try {
    const result = await amcService.togglePlanStatus(req.params.id);
    return res.json(formatResponse(true, `AMC plan status updated to ${result.isActive ? 'Active' : 'Inactive'}.`, result));
  } catch (error) {
    next(error);
  }
};

// ── Requests ────────────────────────────────────────────────────────────

const createRequest = async (req, res, next) => {
  try {
    const companyId = req.user.id;
    const { planId, requestedDeviceCount, notes } = req.body;

    const result = await amcService.createAmcRequest({
      companyId,
      planId,
      requestedDeviceCount: requestedDeviceCount || 1,
      notes
    });

    return res.status(201).json(formatResponse(true, 'AMC request submitted successfully.', result));
  } catch (error) {
    next(error);
  }
};

const getCompanyRequests = async (req, res, next) => {
  try {
    const companyId = req.user.id;
    const requests = await amcService.getAmcRequests({ companyId });
    return res.json(formatResponse(true, 'Company AMC requests retrieved successfully.', requests));
  } catch (error) {
    next(error);
  }
};

const getAdminRequests = async (req, res, next) => {
  try {
    const { status, companyId } = req.query;
    const requests = await amcService.getAmcRequests({ companyId, status });
    return res.json(formatResponse(true, 'All AMC requests retrieved successfully.', requests));
  } catch (error) {
    next(error);
  }
};

const reviewRequest = async (req, res, next) => {
  try {
    const { status, adminNotes } = req.body;
    if (!status) {
      return res.status(400).json(formatResponse(false, 'status is required.'));
    }
    const result = await amcService.reviewAmcRequest({
      requestId: req.params.id,
      adminUserId: req.user.id,
      status,
      adminNotes
    });
    return res.json(formatResponse(true, 'AMC request reviewed successfully.', result));
  } catch (error) {
    next(error);
  }
};

// ── Contracts ───────────────────────────────────────────────────────────

const createAdminContract = async (req, res, next) => {
  try {
    const {
      companyId,
      requestId,
      planId,
      contractType,
      planName,
      deviceCapacity,
      price,
      discountAmount,
      taxAmount,
      totalAmount,
      termsAndConditions,
      offerValidUntil,
      startDate,
      endDate
    } = req.body;

    if (!companyId || !planName || !deviceCapacity || price === undefined || totalAmount === undefined) {
      return res.status(400).json(formatResponse(false, 'companyId, planName, deviceCapacity, price, and totalAmount are required.'));
    }

    if (startDate && endDate) {
      const s = new Date(startDate);
      const e = new Date(endDate);
      if (isNaN(s.getTime()) || isNaN(e.getTime())) {
        return res.status(400).json(formatResponse(false, 'Invalid date format for startDate or endDate.'));
      }
      if (e < s) {
        return res.status(400).json(formatResponse(false, 'Contract end date cannot be earlier than contract start date.'));
      }
    }

    const result = await amcService.createAmcContract({
      companyId,
      requestId,
      planId,
      contractType: contractType || 'standard',
      planName,
      deviceCapacity: parseInt(deviceCapacity, 10),
      price: parseFloat(price),
      discountAmount: discountAmount ? parseFloat(discountAmount) : 0,
      taxAmount: taxAmount ? parseFloat(taxAmount) : 0,
      totalAmount: parseFloat(totalAmount),
      termsAndConditions,
      offerValidUntil,
      startDate,
      endDate,
      createdBy: req.user.id
    });

    return res.status(201).json(formatResponse(true, 'AMC contract created successfully.', result));
  } catch (error) {
    next(error);
  }
};

const getAdminContracts = async (req, res, next) => {
  try {
    const { companyId, status } = req.query;
    const contracts = await amcService.getContracts({ companyId, status });
    return res.json(formatResponse(true, 'AMC contracts retrieved successfully.', contracts));
  } catch (error) {
    next(error);
  }
};

const getAdminContractDetails = async (req, res, next) => {
  try {
    const contract = await amcService.getContractDetails(req.params.id);
    if (!contract) {
      return res.status(404).json(formatResponse(false, 'AMC contract not found.'));
    }
    return res.json(formatResponse(true, 'AMC contract details retrieved successfully.', contract));
  } catch (error) {
    next(error);
  }
};

const approveContract = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.body;
    if (startDate && endDate) {
      const s = new Date(startDate);
      const e = new Date(endDate);
      if (isNaN(s.getTime()) || isNaN(e.getTime())) {
        return res.status(400).json(formatResponse(false, 'Invalid date format for startDate or endDate.'));
      }
      if (e < s) {
        return res.status(400).json(formatResponse(false, 'Contract end date cannot be earlier than contract start date.'));
      }
    }
    const result = await amcService.approveAmcContract({
      contractId: req.params.id,
      adminUserId: req.user.id,
      startDate,
      endDate
    });
    return res.json(formatResponse(true, 'AMC contract approved successfully.', result));
  } catch (error) {
    next(error);
  }
};

const getCompanyContracts = async (req, res, next) => {
  try {
    const companyId = req.user.id;
    const { status } = req.query;
    const contracts = await amcService.getContracts({ companyId, status });
    return res.json(formatResponse(true, 'Company AMC contracts retrieved successfully.', contracts));
  } catch (error) {
    next(error);
  }
};

const getCompanyContractDetails = async (req, res, next) => {
  try {
    const companyId = req.user.id;
    const contract = await amcService.getContractDetails(req.params.id, companyId);
    if (!contract) {
      return res.status(404).json(formatResponse(false, 'AMC contract not found or access denied.'));
    }
    return res.json(formatResponse(true, 'Company AMC contract details retrieved successfully.', contract));
  } catch (error) {
    next(error);
  }
};

const acceptOffer = async (req, res, next) => {
  try {
    const companyId = req.user.id;
    const result = await amcService.acceptAmcOffer({
      contractId: req.params.id,
      companyId,
      userId: req.user.id
    });
    return res.json(formatResponse(true, 'AMC offer accepted successfully.', result));
  } catch (error) {
    next(error);
  }
};

const rejectOffer = async (req, res, next) => {
  try {
    const companyId = req.user.id;
    const { reason } = req.body;
    const result = await amcService.rejectAmcOffer({
      contractId: req.params.id,
      companyId,
      reason,
      userId: req.user.id
    });
    return res.json(formatResponse(true, 'AMC offer rejected successfully.', result));
  } catch (error) {
    next(error);
  }
};

const updateContractStatus = async (req, res, next) => {
  try {
    const { status, reason } = req.body;
    if (!status) {
      return res.status(400).json(formatResponse(false, 'status is required.'));
    }
    const result = await amcService.updateContractStatus({
      contractId: req.params.id,
      adminUserId: req.user.id,
      status,
      reason
    });
    return res.json(formatResponse(true, `Contract status updated to ${status}.`, result));
  } catch (error) {
    next(error);
  }
};

// ── Payment Workflows ───────────────────────────────────────────────────

const createPaymentOrder = async (req, res, next) => {
  try {
    const companyId = req.user.id;
    const result = await amcService.createContractPaymentOrder({
      contractId: req.params.id,
      companyId,
      userId: req.user.id
    });
    return res.status(201).json(formatResponse(true, 'Payment order created successfully.', result));
  } catch (error) {
    if (!error.statusCode) error.statusCode = 400;
    next(error);
  }
};

const verifyPayment = async (req, res, next) => {
  try {
    const companyId = req.user.id;
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
    if (!razorpayOrderId || !razorpayPaymentId) {
      return res.status(400).json(formatResponse(false, 'razorpayOrderId and razorpayPaymentId are required.'));
    }
    const result = await amcService.verifyContractPayment({
      contractId: req.params.id,
      companyId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      userId: req.user.id
    });
    return res.json(formatResponse(true, 'AMC payment verified successfully.', result));
  } catch (error) {
    if (!error.statusCode) error.statusCode = 400;
    next(error);
  }
};

const initiateOfflinePayment = async (req, res, next) => {
  try {
    const companyId = req.user.id;
    const { paymentMethod, referenceNumber, notes } = req.body;
    const result = await amcService.initiateContractOfflinePayment({
      contractId: req.params.id,
      companyId,
      paymentMethod,
      referenceNumber,
      notes,
      userId: req.user.id
    });
    return res.status(201).json(formatResponse(true, 'Offline payment recorded and submitted for verification.', result));
  } catch (error) {
    if (!error.statusCode) error.statusCode = 400;
    next(error);
  }
};

const verifyOfflinePayment = async (req, res, next) => {
  try {
    const { decision, adminNotes } = req.body;
    if (!decision || !['verified', 'rejected'].includes(decision)) {
      return res.status(400).json(formatResponse(false, 'decision must be "verified" or "rejected".'));
    }
    const result = await amcService.verifyContractOfflinePayment({
      contractId: req.params.id,
      adminUserId: req.user.id,
      decision,
      adminNotes
    });
    return res.json(formatResponse(true, `Offline payment ${decision} successfully.`, result));
  } catch (error) {
    if (!error.statusCode) error.statusCode = 400;
    next(error);
  }
};

const getCapacity = async (req, res, next) => {
  try {
    const capacityInfo = await amcService.checkContractCapacity(pool, req.params.id);
    // If company user, verify contract belongs to them
    if (req.user.role === 'company' && capacityInfo.companyId !== req.user.id) {
      return res.status(403).json(formatResponse(false, 'Access denied to this contract.'));
    }
    return res.json(formatResponse(true, 'Contract capacity retrieved successfully.', capacityInfo));
  } catch (error) {
    next(error);
  }
};

const assignDevices = async (req, res, next) => {
  try {
    const companyId = req.user.id;
    const { deviceIds } = req.body;
    if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
      return res.status(400).json(formatResponse(false, 'deviceIds array is required.'));
    }

    const result = await amcService.assignDevicesToCoverage(pool, {
      contractId: req.params.id,
      companyId,
      deviceIds,
      userId: req.user.id
    });

    return res.json(formatResponse(true, 'Devices successfully assigned to AMC coverage.', result));
  } catch (error) {
    if (!error.statusCode) error.statusCode = 400;
    next(error);
  }
};

// ── Device Replacements ─────────────────────────────────────────────────

const requestReplacement = async (req, res, next) => {
  try {
    const companyId = req.user.id;
    const { contractId, oldDeviceId, newDeviceId, reason } = req.body;

    if (!contractId || !oldDeviceId || !newDeviceId || !reason) {
      return res.status(400).json(formatResponse(false, 'contractId, oldDeviceId, newDeviceId, and reason are required.'));
    }

    const result = await amcService.requestDeviceReplacement(pool, {
      contractId,
      companyId,
      oldDeviceId,
      newDeviceId,
      reason,
      userId: req.user.id
    });

    return res.status(201).json(formatResponse(true, 'Device replacement request submitted successfully.', result));
  } catch (error) {
    if (!error.statusCode) error.statusCode = 400;
    next(error);
  }
};

const getCompanyReplacements = async (req, res, next) => {
  try {
    const companyId = req.user.id;
    const [rows] = await pool.query(`
      SELECT r.*, 
        c.contract_number,
        old_dev.brand AS old_brand, old_dev.model_number AS old_model, old_dev.serial_number AS old_serial,
        new_dev.brand AS new_brand, new_dev.model_number AS new_model, new_dev.serial_number AS new_serial
      FROM amc_device_replacements r
      JOIN amc_contracts c ON r.contract_id = c.id
      JOIN company_devices old_dev ON r.old_device_id = old_dev.id
      JOIN company_devices new_dev ON r.new_device_id = new_dev.id
      WHERE r.company_id = ?
      ORDER BY r.created_at DESC
    `, [companyId]);

    return res.json(formatResponse(true, 'Device replacements retrieved successfully.', rows));
  } catch (error) {
    next(error);
  }
};

const getAdminReplacements = async (req, res, next) => {
  try {
    const { status, contractId } = req.query;
    let sql = `
      SELECT r.*, 
        c.contract_number, u.name AS company_name, cp.company_id AS canonical_company_id,
        old_dev.brand AS old_brand, old_dev.model_number AS old_model, old_dev.serial_number AS old_serial,
        new_dev.brand AS new_brand, new_dev.model_number AS new_model, new_dev.serial_number AS new_serial
      FROM amc_device_replacements r
      JOIN amc_contracts c ON r.contract_id = c.id
      JOIN users u ON r.company_id = u.id
      LEFT JOIN company_profiles cp ON u.id = cp.user_id
      JOIN company_devices old_dev ON r.old_device_id = old_dev.id
      JOIN company_devices new_dev ON r.new_device_id = new_dev.id
      WHERE 1=1
    `;
    const params = [];
    if (status) {
      sql += ' AND r.status = ?';
      params.push(status);
    }
    if (contractId) {
      sql += ' AND r.contract_id = ?';
      params.push(contractId);
    }
    sql += ' ORDER BY r.created_at DESC';

    const [rows] = await pool.query(sql, params);
    return res.json(formatResponse(true, 'All replacement requests retrieved successfully.', rows));
  } catch (error) {
    next(error);
  }
};

const reviewReplacement = async (req, res, next) => {
  try {
    const { decision, adminNotes } = req.body;
    if (!decision || !['approved', 'rejected'].includes(decision)) {
      return res.status(400).json(formatResponse(false, 'decision must be "approved" or "rejected".'));
    }

    const result = await amcService.reviewDeviceReplacement(pool, {
      replacementId: req.params.id,
      adminUserId: req.user.id,
      decision,
      adminNotes
    });

    return res.json(formatResponse(true, `Device replacement ${decision} successfully.`, result));
  } catch (error) {
    next(error);
  }
};

// ── Eligibility Check ───────────────────────────────────────────────────

const checkEligibility = async (req, res, next) => {
  try {
    const companyId = req.query.companyId || (req.user ? req.user.id : null);
    const deviceId = req.query.deviceId;

    if (!companyId) {
      return res.status(400).json(formatResponse(false, 'companyId is required.'));
    }

    const eligibility = await amcService.resolveDeviceAmcEligibility(pool, {
      companyId,
      deviceId
    });

    return res.json(formatResponse(true, 'Eligibility checked successfully.', eligibility));
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAdminOverview,
  getPublicPlans,
  getAdminPlans,
  createPlan,
  updatePlan,
  togglePlanStatus,
  createRequest,
  getCompanyRequests,
  getAdminRequests,
  reviewRequest,
  createAdminContract,
  getAdminContracts,
  getAdminContractDetails,
  approveContract,
  getCompanyContracts,
  getCompanyContractDetails,
  acceptOffer,
  rejectOffer,
  updateContractStatus,
  getCapacity,
  assignDevices,
  requestReplacement,
  getCompanyReplacements,
  getAdminReplacements,
  reviewReplacement,
  checkEligibility,
  createPaymentOrder,
  verifyPayment,
  initiateOfflinePayment,
  verifyOfflinePayment
};

