import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Search, AlertCircle } from 'lucide-react';
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  type CountryInfo,
  parsePhoneNumber,
  validatePhoneNumber,
  normalizeToE164,
} from '@/utils/phoneUtils';

export interface PhoneInputProps {
  value?: string;
  onChange: (normalizedValue: string, isValid: boolean) => void;
  onBlur?: () => void;
  error?: string;
  label?: string;
  required?: boolean;
  id?: string;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md';
  defaultCountryCode?: string;
}

export const PhoneInput: React.FC<PhoneInputProps> = ({
  value = '',
  onChange,
  onBlur,
  error,
  label = 'Phone Number',
  required = false,
  id = 'phone',
  name = 'phone',
  placeholder,
  disabled = false,
  className = '',
  size = 'md',
  defaultCountryCode = 'IN',
}) => {
  // Initialize country and national number from incoming value or defaults
  const parsed = parsePhoneNumber(
    value,
    COUNTRIES.find((c) => c.code === defaultCountryCode) || DEFAULT_COUNTRY
  );

  const [selectedCountry, setSelectedCountry] = useState<CountryInfo>(parsed.country);
  const [nationalNumber, setNationalNumber] = useState<string>(parsed.nationalNumber);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Sync internal state when parent value changes externally
  useEffect(() => {
    const updated = parsePhoneNumber(value, selectedCountry);
    setNationalNumber(updated.nationalNumber);
    if (updated.country.code !== selectedCountry.code && value.startsWith('+')) {
      setSelectedCountry(updated.country);
    }
  }, [value]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Auto-focus search input when opened
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen]);

  // Handle number typing
  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const cleanDigits = raw.replace(/\D/g, '').slice(0, selectedCountry.maxLength);
    setNationalNumber(cleanDigits);

    const validation = validatePhoneNumber(cleanDigits, selectedCountry);
    const normalized = cleanDigits ? normalizeToE164(cleanDigits, selectedCountry) : '';
    onChange(normalized, validation.isValid);
  };

  // Handle country switch
  const handleSelectCountry = (country: CountryInfo) => {
    setSelectedCountry(country);
    setDropdownOpen(false);
    setSearchQuery('');

    // Slice digits if exceeding new country's max length
    const adjustedDigits = nationalNumber.slice(0, country.maxLength);
    setNationalNumber(adjustedDigits);

    const validation = validatePhoneNumber(adjustedDigits, country);
    const normalized = adjustedDigits ? normalizeToE164(adjustedDigits, country) : '';
    onChange(normalized, validation.isValid);
  };

  // Filter countries by search query
  const filteredCountries = COUNTRIES.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.dialCode.includes(q) ||
      c.code.toLowerCase().includes(q)
    );
  });

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label
          htmlFor={id}
          className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2"
        >
          {label} {required && <span className="text-red-400"></span>}
        </label>
      )}

      <div className="relative flex items-center">
        {/* Country Selector Dropdown Container */}
        <div className="relative shrink-0" ref={dropdownRef}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setDropdownOpen((prev) => !prev)}
            aria-haspopup="listbox"
            aria-expanded={dropdownOpen}
            aria-label="Select Country Code"
            className={`${
              size === 'sm' ? 'h-9 px-2.5 text-xs' : 'h-11 sm:h-12 px-3 sm:px-3.5 text-xs sm:text-sm'
            } flex items-center gap-1.5 sm:gap-2 bg-zinc-950/80 border ${
              error ? 'border-red-500/50' : 'border-zinc-800 hover:border-zinc-700 focus:border-neon-cyan'
            } rounded-l-xl text-white font-mono focus:outline-none transition-all cursor-pointer select-none`}
          >
            <span className={size === 'sm' ? 'text-sm leading-none' : 'text-base sm:text-lg leading-none'} role="img" aria-label={selectedCountry.name}>
              {selectedCountry.flag}
            </span>
            <span className="text-zinc-200 font-semibold">{selectedCountry.dialCode}</span>
            <ChevronDown
              size={14}
              className={`text-zinc-400 transition-transform duration-200 ${
                dropdownOpen ? 'rotate-180 text-neon-cyan' : ''
              }`}
            />
          </button>

          {/* Floating Dropdown Menu */}
          {dropdownOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-72 sm:w-80 max-h-72 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col backdrop-blur-xl">
              {/* Search Box */}
              <div className="p-2 border-b border-zinc-800/80 bg-zinc-900/60 sticky top-0 z-10">
                <div className="relative flex items-center">
                  <Search size={14} className="absolute left-2.5 text-zinc-500" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search country or code..."
                    className="w-full bg-black/80 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-neon-cyan transition-colors"
                  />
                </div>
              </div>

              {/* Countries Scrollable List */}
              <div className="overflow-y-auto max-h-60 divide-y divide-zinc-900/60 font-sans">
                {filteredCountries.length === 0 ? (
                  <div className="py-6 text-center text-xs text-zinc-500">No countries found</div>
                ) : (
                  filteredCountries.map((c) => {
                    const isSelected = c.code === selectedCountry.code;
                    return (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => handleSelectCountry(c)}
                        className={`w-full px-3 py-2.5 flex items-center justify-between text-left text-xs hover:bg-white/5 transition-colors cursor-pointer ${
                          isSelected ? 'bg-neon-cyan/10 text-neon-cyan font-semibold' : 'text-zinc-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate mr-2">
                          <span className="text-base shrink-0 leading-none">{c.flag}</span>
                          <span className="truncate">{c.name}</span>
                        </div>
                        <span className="font-mono text-xs text-zinc-400 shrink-0 font-medium">
                          {c.dialCode}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* National Phone Number Input */}
        <div className="relative flex-1 min-w-0">
          <input
            type="tel"
            id={id}
            name={name}
            value={nationalNumber}
            onChange={handleNumberChange}
            onBlur={onBlur}
            disabled={disabled}
            placeholder={placeholder || selectedCountry.placeholder}
            maxLength={selectedCountry.maxLength}
            className={`w-full ${
              size === 'sm' ? 'h-9 px-3 text-xs' : 'h-11 sm:h-12 px-3.5 sm:px-4 text-sm'
            } bg-zinc-950/80 border-y border-r ${
              error
                ? 'border-red-500/50 focus:border-red-500'
                : 'border-zinc-800 focus:border-neon-cyan'
            } rounded-r-xl text-white placeholder-zinc-600 focus:outline-none transition-all font-mono`}
          />
        </div>
      </div>

      {/* Field Error Message */}
      {error && (
        <p className="flex items-center gap-1 text-xs font-mono text-red-400 mt-1.5 px-0.5">
          <AlertCircle size={12} className="shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
};

export default PhoneInput;
