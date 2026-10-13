import React, { useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, CheckCircle, Mail, Phone, MapPin, ExternalLink } from "lucide-react";
import { InstagramIcon, FacebookIcon, TwitterIcon, LinkedinIcon } from "@/components/SocialIcons";
import { contactApi } from "@/services/api";
import { VALIDATION, isValidEmail, validateName, validateMessage } from "@/config/constants";
import { useSiteContext } from "@/context/SiteContext";
import PhoneInput from "@/components/PhoneInput";
import { validatePhoneNumber, parsePhoneNumber, DEFAULT_COUNTRY } from "@/utils/phoneUtils";
import { getRecaptchaToken } from "@/utils/recaptcha";

type Fields = "name" | "email" | "phone" | "message";

function validateContact(data: Record<Fields, string>) {
  const errors: Partial<Record<Fields, string>> = {};

  // name: required, min 2, max 50, letters/spaces/hyphens/apostrophes only
  const nameVal = validateName(data.name, "Full name");
  if (!nameVal.isValid) {
    errors.name = nameVal.error;
  }

  // email: required, valid format
  if (!data.email.trim()) errors.email = "Email address is required.";
  else if (!isValidEmail(data.email))
    errors.email = "Invalid email address. Please enter a valid email address.";

  // phone: validate with country rules
  if (!data.phone || !data.phone.trim()) {
    errors.phone = "Phone number is required.";
  } else {
    const { country, nationalNumber } = parsePhoneNumber(data.phone, DEFAULT_COUNTRY);
    const phoneRes = validatePhoneNumber(nationalNumber, country);
    if (!phoneRes.isValid) {
      errors.phone = phoneRes.error || "Invalid phone number. Please enter a valid phone number with country code.";
    }
  }

  // message: required, min 10, max 500
  const msgVal = validateMessage(data.message, "Message", VALIDATION.CONTACT.MESSAGE_MIN_LENGTH, VALIDATION.CONTACT.MESSAGE_MAX_LENGTH);
  if (!msgVal.isValid) {
    errors.message = msgVal.error;
  }

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
      const recaptchaToken = await getRecaptchaToken('contact_us');
      const result = await contactApi.submitForm({
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        message: formData.message.trim(),
        recaptchaToken,
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send message. Please try again.';
      setStatus({
        type: 'error',
        message: msg,
      });
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
                    maxLength={VALIDATION.CONTACT.NAME_MAX_LENGTH}
                  />
                  <FieldError msg={touched.name ? fieldErrors.name : undefined} />
                </div>

                {/* Mobile Number with Country Code */}
                <div>
                  <PhoneInput
                    id="phone"
                    name="phone"
                    label="Phone Number"
                    required
                    value={formData.phone}
                    onChange={(normalized) => {
                      const updated = { ...formData, phone: normalized };
                      setFormData(updated);
                      if (touched.phone) setFieldErrors(validate(updated));
                    }}
                    onBlur={() => handleBlur("phone")}
                    error={touched.phone ? fieldErrors.phone : undefined}
                  />
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
                    maxLength={VALIDATION.CONTACT.MESSAGE_MAX_LENGTH}
                  />
                  <div className="flex items-start justify-between mt-1">
                    <FieldError msg={touched.message ? fieldErrors.message : undefined} />
                    <span
                      className={`text-[10px] font-mono ml-auto ${
                        formData.message.length > 0 && formData.message.length < 10
                          ? "text-red-400"
                          : formData.message.length >= 450
                          ? "text-yellow-400"
                          : "text-zinc-600"
                      }`}
                    >
                      {formData.message.length} / {VALIDATION.CONTACT.MESSAGE_MAX_LENGTH}
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
                    <div className="p-2 bg-zinc-800 rounded-lg text-neon-cyan">
                      <Mail size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Email</p>
                      <p className="text-sm">{flattenedSettings.company_email || "support@tekdoctor.in"}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-zinc-800 rounded-lg text-neon-cyan">
                      <Phone size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Phone</p>
                      <p className="text-sm">{flattenedSettings.company_phone || "+91 9029073477"}</p>
                      {flattenedSettings.company_alternate_phone && flattenedSettings.company_alternate_phone.trim() !== '' && (
                        <p className="text-sm text-zinc-400 mt-1 flex items-center gap-1.5 font-mono text-xs">
                          <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Alt:</span> {flattenedSettings.company_alternate_phone}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-zinc-800 rounded-lg text-neon-cyan">
                      <MapPin size={20} />
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
                          View on Google Maps <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Social Links */}
              <div className="bg-zinc-900/50 p-8 rounded-xl border border-zinc-800">
                <h3 className="text-xl font-bold mb-6">Follow Us</h3>
                <div className="flex flex-wrap gap-4">
                  {flattenedSettings.instagram_url && (
                    <a
                      href={flattenedSettings.instagram_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center text-zinc-300 hover:bg-neon-cyan hover:text-black transition-all cursor-pointer group"
                      aria-label="Follow us on Instagram"
                    >
                      <InstagramIcon size={20} className="transition-transform group-hover:scale-110" />
                    </a>
                  )}
                  {flattenedSettings.facebook_url && (
                    <a
                      href={flattenedSettings.facebook_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center text-zinc-300 hover:bg-neon-cyan hover:text-black transition-all cursor-pointer group"
                      aria-label="Follow us on Facebook"
                    >
                      <FacebookIcon size={20} className="transition-transform group-hover:scale-110" />
                    </a>
                  )}
                  {flattenedSettings.twitter_url && (
                    <a
                      href={flattenedSettings.twitter_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center text-zinc-300 hover:bg-neon-cyan hover:text-black transition-all cursor-pointer group"
                      aria-label="Follow us on Twitter / X"
                    >
                      <TwitterIcon size={20} className="transition-transform group-hover:scale-110" />
                    </a>
                  )}
                  {flattenedSettings.linkedin_url && (
                    <a
                      href={flattenedSettings.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center text-zinc-300 hover:bg-neon-cyan hover:text-black transition-all cursor-pointer group"
                      aria-label="Follow us on LinkedIn"
                    >
                      <LinkedinIcon size={20} className="transition-transform group-hover:scale-110" />
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
