const { pool } = require('../config/db.config');
const { formatResponse } = require('../utils/helpers');

// Submit testimonial (User & Company Dashboard Feedback Widget)
// POST /api/testimonials
const submitTestimonial = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const userId = req.user.id;
        const { rating, comment } = req.body;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json(formatResponse(false, 'Rating must be between 1 and 5.'));
        }
        if (!comment || comment.trim() === '') {
            return res.status(400).json(formatResponse(false, 'Comment is required.'));
        }

        const [result] = await connection.query(
            'INSERT INTO testimonials (user_id, rating, comment, is_approved) VALUES (?, ?, ?, FALSE)',
            [userId, Number(rating), comment.trim()]
        );

        return res.status(201).json(formatResponse(true, 'Feedback submitted successfully. It will be live on public website post-admin approval.', {
            id: result.insertId
        }));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

// Get approved testimonials (Public Website)
// GET /api/testimonials
const getApprovedTestimonials = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.query(`
            SELECT 
                t.id, 
                t.rating, 
                t.comment, 
                t.created_at, 
                u.name as user_name, 
                u.role as user_role, 
                cp.company_name
            FROM testimonials t
            JOIN users u ON t.user_id = u.id
            LEFT JOIN company_profiles cp ON u.id = cp.user_id
            WHERE t.is_approved = TRUE
            ORDER BY t.created_at DESC
        `);
        return res.status(200).json(formatResponse(true, 'Approved testimonials fetched.', rows));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

// Admin retrieve all testimonials
// GET /api/testimonials/admin
const getAllTestimonialsAdmin = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.query(`
            SELECT 
                t.id, 
                t.rating, 
                t.comment, 
                t.is_approved,
                t.created_at, 
                u.name as user_name, 
                u.email as user_email,
                u.role as user_role, 
                cp.company_name
            FROM testimonials t
            JOIN users u ON t.user_id = u.id
            LEFT JOIN company_profiles cp ON u.id = cp.user_id
            ORDER BY t.created_at DESC
        `);
        return res.status(200).json(formatResponse(true, 'All testimonials fetched for admin.', rows));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

// Admin approve testimonial
// PUT /api/testimonials/:id/approve
const approveTestimonial = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const { id } = req.params;
        const { is_approved } = req.body;

        await connection.query(
            'UPDATE testimonials SET is_approved = ? WHERE id = ?',
            [is_approved ? 1 : 0, Number(id)]
        );

        return res.status(200).json(formatResponse(true, `Testimonial ${is_approved ? 'approved' : 'unapproved'} successfully.`));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

// Admin edit testimonial
// PUT /api/testimonials/:id
const editTestimonialAdmin = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const { id } = req.params;
        const { comment, rating } = req.body;

        if (!comment || !rating) {
            return res.status(400).json(formatResponse(false, 'Comment and rating are required for edit.'));
        }

        const [result] = await connection.query(
            'UPDATE testimonials SET comment = ?, rating = ? WHERE id = ?',
            [comment, Number(rating), Number(id)]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json(formatResponse(false, 'Testimonial not found.'));
        }

        return res.status(200).json(formatResponse(true, 'Testimonial updated successfully.'));
    } catch (err) {
        next(err);
    } finally {
        if (connection) connection.release();
    }
};

// Admin delete testimonial
// DELETE /api/testimonials/:id
const deleteTestimonial = async (req, res, next) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const { id } = req.params;

        await connection.query('DELETE FROM testimonials WHERE id = ?', [Number(id)]);

        return res.status(200).json(formatResponse(true, 'Testimonial deleted successfully.'));
    } catch (error) {
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

module.exports = {
    submitTestimonial,
    getApprovedTestimonials,
    getAllTestimonialsAdmin,
    approveTestimonial,
    editTestimonialAdmin,
    deleteTestimonial
};
