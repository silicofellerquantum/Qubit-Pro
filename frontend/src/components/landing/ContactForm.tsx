import { useState, useRef, useEffect } from "react";
import { CheckCircle2, AlertCircle, Loader2, ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { submitContactForm } from "@/lib/api/backend";

// ── Email Validator Regex ───────────────────────────────────────────────────
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FormValues {
  name: string;
  email: string;
  company: string;
  message: string;
}

interface FormErrors {
  name?: string;
  email?: string;
  message?: string;
}

export function ContactForm() {
  const [values, setValues] = useState<FormValues>({
    name: "",
    email: "",
    company: "",
    message: "",
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<keyof FormValues, boolean>>({
    name: false,
    email: false,
    company: false,
    message: false,
  });

  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [serverError, setServerError] = useState<string | null>(null);

  // For focus management
  const firstErrorRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const successRef = useRef<HTMLDivElement | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);

  // Real-time Validation logic
  const validate = (field: keyof FormValues, val: string): string => {
    if (field === "name") {
      if (!val.trim()) return "Name is required.";
      if (val.trim().length < 2) return "Name must be at least 2 characters.";
    }
    if (field === "email") {
      if (!val.trim()) return "Email is required.";
      if (!EMAIL_REGEX.test(val.trim())) return "Please enter a valid email address.";
    }
    if (field === "message") {
      if (!val.trim()) return "Message is required.";
      if (val.trim().length < 10) return "Message must be at least 10 characters.";
    }
    return "";
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const fieldName = name as keyof FormValues;
    setValues((prev) => ({ ...prev, [fieldName]: value }));

    if (touched[fieldName]) {
      const err = validate(fieldName, value);
      setErrors((prev) => ({ ...prev, [fieldName]: err || undefined }));
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const fieldName = name as keyof FormValues;
    setTouched((prev) => ({ ...prev, [fieldName]: true }));

    const err = validate(fieldName, value);
    setErrors((prev) => ({ ...prev, [fieldName]: err || undefined }));
  };

  // Check if entire form is valid
  const isFormValid = () => {
    const nameErr = validate("name", values.name);
    const emailErr = validate("email", values.email);
    const messageErr = validate("message", values.message);

    return !nameErr && !emailErr && !messageErr;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Mark all as touched
    const allTouched = { name: true, email: true, company: true, message: true };
    setTouched(allTouched);

    // Validate all fields
    const nameErr = validate("name", values.name);
    const emailErr = validate("email", values.email);
    const messageErr = validate("message", values.message);

    const newErrors: FormErrors = {};
    if (nameErr) newErrors.name = nameErr;
    if (emailErr) newErrors.email = emailErr;
    if (messageErr) newErrors.message = messageErr;

    setErrors(newErrors);

    if (nameErr || emailErr || messageErr) {
      // Focus the first invalid field
      setTimeout(() => {
        firstErrorRef.current?.focus();
      }, 50);
      return;
    }

    setStatus("loading");
    setServerError(null);

    try {
      const response = await submitContactForm({
        name: values.name.trim(),
        email: values.email.trim(),
        company: values.company.trim() || undefined,
        message: values.message.trim(),
      });

      if (response.success) {
        setStatus("success");
        setValues({ name: "", email: "", company: "", message: "" });
        setTouched({ name: false, email: false, company: false, message: false });
        setErrors({});
        // Focus the success message for screen readers
        setTimeout(() => {
          successRef.current?.focus();
        }, 50);
      } else {
        throw new Error(response.message || "Failed to send email.");
      }
    } catch (err: any) {
      setStatus("error");
      setServerError(err.message || "Failed to send. Please try again.");
      setTimeout(() => {
        errorRef.current?.focus();
      }, 50);
    }
  };

  // Success auto-fade back to idle
  useEffect(() => {
    if (status === "success") {
      const timer = setTimeout(() => {
        setStatus("idle");
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  const hasNameError = touched.name && !!errors.name;
  const hasEmailError = touched.email && !!errors.email;
  const hasMessageError = touched.message && !!errors.message;

  return (
    <div className="w-full">
      {/* Dynamic Status Banner */}
      <div aria-live="polite" className="mb-4">
        {status === "success" && (
          <div
            ref={successRef}
            tabIndex={-1}
            className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 outline-none focus:ring-2 focus:ring-green-500"
          >
            <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 animate-bounce" />
            <p className="font-medium">Message sent! We'll be in touch.</p>
          </div>
        )}

        {status === "error" && (
          <div
            ref={errorRef}
            tabIndex={-1}
            className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 outline-none focus:ring-2 focus:ring-red-500"
          >
            <AlertCircle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">{serverError || "Failed to send. Please try again."}</p>
              <Button
                type="button"
                onClick={handleSubmit}
                variant="link"
                className="h-auto p-0 text-red-800 font-semibold underline hover:text-red-950 mt-1 inline-flex items-center gap-1"
              >
                <RefreshCw className="h-3 w-3" /> Retry sending
              </Button>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {/* Name Field */}
          <div>
            <label htmlFor="contact-name" className="text-xs font-semibold text-[#555] block">
              Name <span className="text-red-500" aria-hidden="true">*</span>
            </label>
            <input
              id="contact-name"
              name="name"
              type="text"
              value={values.name}
              onChange={handleChange}
              onBlur={handleBlur}
              disabled={status === "loading"}
              placeholder="Ada Lovelace"
              aria-required="true"
              aria-invalid={hasNameError ? "true" : "false"}
              aria-describedby={hasNameError ? "name-error" : undefined}
              ref={hasNameError ? (el) => { if (!firstErrorRef.current) firstErrorRef.current = el; } : null}
              className={`mt-2 w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-foreground outline-none transition-all placeholder:text-foreground/30 focus:border-[#F26B3A] focus:ring-1 focus:ring-[#F26B3A] ${
                hasNameError ? "border-red-500 focus:border-red-500 focus:ring-red-500" : "border-black/15"
              }`}
            />
            {hasNameError && (
              <span id="name-error" className="text-xs text-red-500 mt-1 block font-medium" role="alert">
                {errors.name}
              </span>
            )}
          </div>

          {/* Email Field */}
          <div>
            <label htmlFor="contact-email" className="text-xs font-semibold text-[#555] block">
              Email <span className="text-red-500" aria-hidden="true">*</span>
            </label>
            <input
              id="contact-email"
              name="email"
              type="email"
              value={values.email}
              onChange={handleChange}
              onBlur={handleBlur}
              disabled={status === "loading"}
              placeholder="you@company.com"
              aria-required="true"
              aria-invalid={hasEmailError ? "true" : "false"}
              aria-describedby={hasEmailError ? "email-error" : undefined}
              ref={hasEmailError && !firstErrorRef.current ? (el) => { firstErrorRef.current = el; } : null}
              className={`mt-2 w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-foreground outline-none transition-all placeholder:text-foreground/30 focus:border-[#F26B3A] focus:ring-1 focus:ring-[#F26B3A] ${
                hasEmailError ? "border-red-500 focus:border-red-500 focus:ring-red-500" : "border-black/15"
              }`}
            />
            {hasEmailError && (
              <span id="email-error" className="text-xs text-red-500 mt-1 block font-medium" role="alert">
                {errors.email}
              </span>
            )}
          </div>

          {/* Company Field (Optional) */}
          <div className="sm:col-span-2">
            <label htmlFor="contact-company" className="text-xs font-semibold text-[#555] block">
              Company
            </label>
            <input
              id="contact-company"
              name="company"
              type="text"
              value={values.company}
              onChange={handleChange}
              disabled={status === "loading"}
              placeholder="Acme Semiconductors"
              className="mt-2 w-full rounded-lg border border-black/15 bg-white px-3 py-2.5 text-sm text-foreground outline-none transition-all placeholder:text-foreground/30 focus:border-[#F26B3A] focus:ring-1 focus:ring-[#F26B3A]"
            />
          </div>

          {/* Message Field */}
          <div className="sm:col-span-2">
            <label htmlFor="contact-message" className="text-xs font-semibold text-[#555] block">
              Message <span className="text-red-500" aria-hidden="true">*</span>
            </label>
            <textarea
              id="contact-message"
              name="message"
              rows={5}
              value={values.message}
              onChange={handleChange}
              onBlur={handleBlur}
              disabled={status === "loading"}
              placeholder="Tell us about your quantum chip idea…"
              aria-required="true"
              aria-invalid={hasMessageError ? "true" : "false"}
              aria-describedby={hasMessageError ? "message-error" : undefined}
              ref={hasMessageError && !firstErrorRef.current ? (el) => { firstErrorRef.current = el; } : null}
              className={`mt-2 w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-foreground outline-none transition-all placeholder:text-foreground/30 focus:border-[#F26B3A] focus:ring-1 focus:ring-[#F26B3A] ${
                hasMessageError ? "border-red-500 focus:border-red-500 focus:ring-red-500" : "border-black/15"
              }`}
            />
            {hasMessageError && (
              <span id="message-error" className="text-xs text-red-500 mt-1 block font-medium" role="alert">
                {errors.message}
              </span>
            )}
          </div>
        </div>

        {/* Submit Button */}
        <Button
          type="submit"
          disabled={status === "loading" || !isFormValid()}
          className="mt-6 h-12 w-full sm:w-auto rounded-full bg-[#1a1a1a] px-8 text-sm font-semibold text-white hover:bg-[#1a1a1a]/90 transition-all shadow-sm focus-visible:ring-[#F26B3A] focus-visible:ring-2 disabled:bg-neutral-300 disabled:text-neutral-500 disabled:shadow-none disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {status === "loading" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              Send message
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
