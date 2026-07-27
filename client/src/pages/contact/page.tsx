import React, { useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, CheckCircle } from "lucide-react";
import { contactApi } from "@/services/api";
import { VALIDATION, isValidEmail, isValidPhone } from "@/config/constants";
import { useSiteContext } from "@/context/SiteContext";

type Fields = "name" | "email" | "phone" | "message";

function validateContact(data: Record<Fields, string>) {
  const errors: Partial<Record<Fields, string>> = {};

  // name: required, min/max bounds
  if (!data.name.trim()) errors.name = "Full name is required.";
  else if (data.name.trim().length < VALIDATION.CONTACT.NAME_MIN_LENGTH)
    errors.name = `Name must be at least ${VALIDATION.CONTACT.NAME_MIN_LENGTH} characters.`;
  else if (data.name.trim().length > VALIDATION.CONTACT.NAME_MAX_LENGTH)
    errors.name = `Name must be under ${VALIDATION.CONTACT.NAME_MAX_LENGTH} characters.`;
  else if (!/^[a-zA-Z\s'-]+$/.test(data.name.trim()))
    errors.name =
      "Name can only contain letters, spaces, hyphens and apostrophes.";

  // email: required, valid format
  if (!data.email.trim()) errors.email = "Email address is required.";
  else if (!isValidEmail(data.email))
    errors.email = "Enter a valid email address (e.g. you@example.com).";

  // phone: required, valid format
  if (!data.phone.trim()) errors.phone = "Phone number is required.";
  else if (!isValidPhone(data.phone))
    errors.phone = "Phone must contain 10–15 digits (numbers only).";

  // message: required, min/max bounds
  if (!data.message.trim()) errors.message = "Message is required.";
  else if (data.message.trim().length < VALIDATION.CONTACT.MESSAGE_MIN_LENGTH)
    errors.message = `Message must be at least ${VALIDATION.CONTACT.MESSAGE_MIN_LENGTH} characters.`;
  else if (data.message.trim().length > VALIDATION.CONTACT.MESSAGE_MAX_LENGTH)
    errors.message = `Message must be under ${VALIDATION.CONTACT.MESSAGE_MAX_LENGTH} characters.`;

  return errors;
}

// ── Field error component ───────────────────────────────────────────────────
function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <motion.p
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-1.5 text-[10px] font-mono text-red-400 mt-1 px-0.5"
    >
      <AlertCircle size={10} className="shrink-0" /> {msg}
    </motion.p>
  );
}

interface ContactApiResponse {
  success: boolean;
  message: string;
  data?: { contactId: number };
}

const emptyForm: Record<Fields, string> = {
  name: "",
  email: "",
  phone: "",
  message: "",
};

const emptyTouched: Record<Fields, boolean> = {
  name: false,
  email: false,
  phone: false,
  message: false,
};

const Contact = () => {
  const { flattenedSettings } = useSiteContext();
  const [formData, setFormData] = useState<Record<Fields, string>>(emptyForm);
  const [touched, setTouched] = useState<Record<Fields, boolean>>(emptyTouched);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<Fields, string>>
  >({});
  const [status, setStatus] = useState<{
    type: "success" | "error" | "";
    message: string;
  }>({ type: "", message: "" });
  const [loading, setLoading] = useState(false);

  const validate = (data = formData) => validateContact(data);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    const updated = { ...formData, [name]: value };
    setFormData(updated);
    if (touched[name as Fields]) setFieldErrors(validate(updated));
  };

  const handleBlur = (name: Fields) => {
    setTouched((prev) => ({ ...prev, [name]: true }));
    setFieldErrors(validate());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // prevent duplicate submissions

    setStatus({ type: "", message: "" });
    setTouched({
      name: true,
      email: true,
      phone: true,
      message: true,
    });

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    try {
      const result = await contactApi.submitForm({
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        message: formData.message.trim(),
      });

      if (!result.ok) {
        const serverErrors = (result.data as any)?.errors;
        if (serverErrors && typeof serverErrors === 'object') {
          setFieldErrors(serverErrors);
          const newTouched = { ...emptyTouched };
          Object.keys(serverErrors).forEach((key) => {
            newTouched[key as Fields] = true;
          });
          setTouched(newTouched);
        }

        setStatus({
          type: "error",
          message: result.error || "Failed to send message. Please try again.",
        });
        return;
      }

      setStatus({
        type: "success",
        message: "✓ Message sent! We will contact you soon.",
      });
      // Reset form after success
      setFormData(emptyForm);
      setTouched(emptyTouched);
      setFieldErrors({});
    } finally {
      setLoading(false);
    }
  };

  const inputClass = (field: Fields) =>
    `w-full bg-zinc-800 border rounded-lg px-4 py-3 text-white focus:outline-none transition-all ${touched[field] && fieldErrors[field]
      ? "border-red-500/70 focus:border-red-500 focus:ring-1 focus:ring-red-500/20"
      : "border-zinc-700 focus:border-neon-cyan focus:ring-1 focus:ring-neon-cyan"
    }`;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl md:text-6xl font-bold mb-8 text-center">
            Contact <span className="text-neon-cyan">Us</span>
          </h1>
          <p className="text-zinc-400 text-center mb-12 max-w-2xl mx-auto">
            Have questions? Need support? Want to collaborate? We would love to
            hear from you. Reach out through any of the channels below.
          </p>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Contact Form */}
            <div className="bg-zinc-900/50 p-8 rounded-xl border border-zinc-800">
              <h3 className="text-xl font-bold mb-6">Send Us a Message</h3>
              {status.message && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`p-4 rounded-lg mb-6 text-sm flex items-center gap-2 ${status.type === "success"
                    ? "bg-green-500/10 text-green-400 border border-green-500/20"
                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                    }`}
                >
                  {status.type === "success" ? (
                    <CheckCircle size={14} className="shrink-0" />
                  ) : (
                    <AlertCircle size={14} className="shrink-0" />
                  )}
                  {status.message}
                </motion.div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                {/* Full Name */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                    Full Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    onBlur={() => handleBlur("name")}
                    className={inputClass("name")}
                    placeholder="Enter your full name"
                    maxLength={100}
                  />
                  <FieldError msg={touched.name ? fieldErrors.name : undefined} />
                </div>

                {/* Mobile Number */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                    Phone Number <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    onBlur={() => handleBlur("phone")}
                    className={inputClass("phone")}
                    placeholder="+91 98765 43210"
                    maxLength={15}
                  />
                  <FieldError msg={touched.phone ? fieldErrors.phone : undefined} />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                    Email Address <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    onBlur={() => handleBlur("email")}
                    className={inputClass("email")}
                    placeholder="you@example.com"
                  />
                  <FieldError msg={touched.email ? fieldErrors.email : undefined} />
                </div>



                {/* Problem Description */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                    Message <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    rows={4}
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    onBlur={() => handleBlur("message")}
                    className={inputClass("message")}
                    placeholder="Tell us about your needs..."
                    maxLength={2000}
                  />
                  <div className="flex items-start justify-between mt-1">
                    <FieldError msg={touched.message ? fieldErrors.message : undefined} />
                    <span
                      className={`text-[10px] font-mono ml-auto ${formData.message.length > 0 &&
                        formData.message.length < 10
                        ? "text-red-400"
                        : formData.message.length >= 1800
                          ? "text-yellow-400"
                          : "text-zinc-600"
                        }`}
                    >
                      {formData.message.length}/2000
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-neon-cyan text-black font-bold py-3 rounded-lg hover:bg-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Sending..." : "Send Message"}
                </button>
              </form>
            </div>

            {/* Contact Info */}
            <div className="space-y-6">
              <div className="bg-zinc-900/50 p-8 rounded-xl border border-zinc-800">
                <h3 className="text-xl font-bold mb-6">Get in Touch</h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-zinc-800 rounded-lg">
                      <svg className="w-5 h-5 text-neon-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Email</p>
                      <p className="text-sm">{flattenedSettings.company_email || "support@tekdoctor.in"}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-zinc-800 rounded-lg">
                      <svg className="w-5 h-5 text-neon-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Phone</p>
                      <p className="text-sm">{flattenedSettings.company_phone || "+91 9029073477"}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-zinc-800 rounded-lg">
                      <svg className="w-5 h-5 text-neon-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Address</p>
                      {flattenedSettings.company_address ? (
                        flattenedSettings.company_address.split('\n').map((line, i) => (
                          <p key={i} className="text-sm">{line}</p>
                        ))
                      ) : (
                        <>
                          <p className="text-sm">B302, Raylon Arcade, Kondivita,</p>
                          <p className="text-sm">Andheri East, Mumbai, Maharashtra 400059</p>
                        </>
                      )}
                      {flattenedSettings.google_maps_link && (
                        <a
                          href={flattenedSettings.google_maps_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-neon-cyan hover:text-white transition-colors mt-2"
                        >
                          View on Google Maps &rarr;
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Social Links */}
              <div className="bg-zinc-900/50 p-8 rounded-xl border border-zinc-800">
                <h3 className="text-xl font-bold mb-6">Follow Us</h3>
                <div className="flex gap-4">
                  {flattenedSettings.instagram_url && (
                    <a href={flattenedSettings.instagram_url} target="_blank" rel="noopener noreferrer" className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center hover:bg-neon-cyan transition-colors">
                      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.07 1.645.07 4.85s-.012 3.584-.07 4.85c-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.85s.012-3.584.07-4.85c.148-3.227 1.664-4.771 4.919-4.919 1.265-.057 1.645-.07 4.85-.07z" />
                      </svg>
                    </a>
                  )}
                  {flattenedSettings.facebook_url && (
                    <a href={flattenedSettings.facebook_url} target="_blank" rel="noopener noreferrer" className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center hover:bg-neon-cyan transition-colors">
                      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073c0 6.019 4.388 11.009 10.125 11.927v-8.437H7.078v-3.49h3.047V9.413c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953h-1.514c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.082 24 18.092 24 12.073z" />
                      </svg>
                    </a>
                  )}
                  {flattenedSettings.linkedin_url && (
                    <a href={flattenedSettings.linkedin_url} target="_blank" rel="noopener noreferrer" className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center hover:bg-neon-cyan transition-colors">
                      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452z" />
                      </svg>
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Contact;
