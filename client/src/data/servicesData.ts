import { Cpu, Laptop, RotateCcw, Cctv, MonitorPlay, Wifi, Zap, Smartphone, HardDrive, Bug, Activity, Download, Terminal, PlusCircle, Settings, Sliders, Wrench, CheckCircle2 } from 'lucide-react';

export interface ServiceData {
  id: number;
  title: string;
  desc: string;
  shortDesc: string;
  fullDesc: string;
  features: string[];
  icon: any;
  color: string;
  gradient: string;
  glow: string;
  labStats: {
    label: string;
    value: string;
  }[];
  category: 'Hardware' | 'Software' | 'Security' | 'Network';
}

export const servicesData: ServiceData[] = [
  {
    id: 1,
    title: "Component Surgery",
    desc: "Expert microsoldering and logic board restoration",
    shortDesc: "Microsoldering & logic board restoration.",
    fullDesc: "Our Class-10 cleanroom laboratory is equipped for high-precision microsoldering. We specialize in reviving hardware deemed 'unfixable' by original manufacturers, repairing circuitry at the component level.",
    features: ["Logic Board Repair", "IC Chip Replacement", "Liquid Damage Restoration", "FPC Connector Repair"],
    icon: Cpu,
    color: "from-neon-cyan to-blue-600",
    gradient: "via-neon-cyan/10",
    glow: "rgba(6, 182, 212, 0.2)",
    labStats: [
      { label: "Precision", value: "0.02mm" },
      { label: "Success Rate", value: "94%" }
    ],
    category: 'Hardware'
  },
  {
    id: 2,
    title: "Laptop Clinic",
    desc: "Screen & hinge repairs with performance upgrades",
    shortDesc: "Screen surgery & hardware transplants.",
    fullDesc: "From ultrabooks to high-end gaming rigs, we perform structural repairs and performance upgrades. We source OEM-grade displays and custom-fabricate hinge mounts for lasting durability.",
    features: ["OLED/LCD Replacement", "Hinge Reconstruction", "Thermal Management", "Keyboard Mapping"],
    icon: Laptop,
    color: "from-purple-500 to-pink-600",
    gradient: "via-purple-500/10",
    glow: "rgba(236, 72, 153, 0.2)",
    labStats: [
      { label: "Turnaround", value: "24-48h" },
      { label: "OEM Parts", value: "Verified" }
    ],
    category: 'Hardware'
  },
  {
    id: 3,
    title: "Data Recovery",
    desc: "Emergency retrieval from compromised drives",
    shortDesc: "Emergency retrieval from dead drives.",
    fullDesc: "When software solutions fail, we go physical. We perform platter swaps and controller bypasses in a controlled environment to rescue your most critical digital assets from physically compromised drives.",
    features: ["HDD Platter Swap", "SSD Controller Repair", "RAID Array Rebuild", "Forensic Extraction"],
    icon: HardDrive,
    color: "from-emerald-500 to-teal-600",
    gradient: "via-emerald-500/10",
    glow: "rgba(20, 184, 166, 0.2)",
    labStats: [
      { label: "Recovery Rate", value: "98%" },
      { label: "Security", value: "Encrypted" }
    ],
    category: 'Software'
  },
  {
    id: 4,
    title: "Security Hub",
    desc: "AI-powered surveillance & IP camera networks",
    shortDesc: "High-definition IP surveillance networks.",
    fullDesc: "Enterprise-grade security architecture designed for the modern age. We integrate AI-driven motion tracking with encrypted local storage, ensuring your premises are monitored 24/7 with zero-latency feeds.",
    features: ["AI Motion Tracking", "Night Vision IP Cameras", "Remote Access Setup", "24/7 Local Recording"],
    icon: Cctv,
    color: "from-orange-500 to-red-600",
    gradient: "via-orange-500/10",
    glow: "rgba(249, 115, 22, 0.2)",
    labStats: [
      { label: "Latency", value: "<100ms" },
      { label: "Uptime", value: "99.9%" }
    ],
    category: 'Security'
  },
  {
    id: 5,
    title: "Network Solutions",
    desc: "WiFi optimization & enterprise connectivity",
    shortDesc: "Home/office network architecture and mesh systems.",
    fullDesc: "Say goodbye to dead zones. We analyze your floor plan to deploy enterprise-grade access points, ensuring seamless roaming and maximum throughput for all your smart devices and workstations.",
    features: ["Mesh WiFi Setup", "Cat6e Cabling", "VLAN Configuration", "Network Security Audit"],
    icon: Wifi,
    color: "from-pink-500 to-rose-600",
    gradient: "via-pink-500/10",
    glow: "rgba(244, 63, 94, 0.2)",
    labStats: [
      { label: "Coverage", value: "100%" },
      { label: "Speed", value: "10Gbps Ready" }
    ],
    category: 'Network'
  },
  {
    id: 6,
    title: "Display Lab",
    desc: "Panel diagnosis and flat-screen restoration",
    shortDesc: "Professional TV and Monitor diagnostics.",
    fullDesc: "Precision screen replacement and backlight repair services for high-end televisions and professional monitors. We use calibrated equipment to ensure color accuracy and panel longevity.",
    features: ["4K/8K Panel Repair", "Backlight Strip Replacement", "T-Con Board Diagnosis", "Calibration Services"],
    icon: MonitorPlay,
    color: "from-blue-500 to-neon-cyan",
    gradient: "via-blue-500/10",
    glow: "rgba(59, 130, 246, 0.2)",
    labStats: [
      { label: "Max Size", value: "100\"" },
      { label: "Color Accuracy", value: "ΔE < 2" }
    ],
    category: 'Hardware'
  }
];

export const homeServicesData: ServiceData[] = [
  {
    id: 11,
    title: "Virus & Spyware Removal",
    desc: "Complete malware sanitization and registry protection",
    shortDesc: "Triage and disinfection of compromised operating systems.",
    fullDesc: "Deep-system disinfection targeting trojans, ransomware, adware, and spyware. We run multi-engine forensic diagnostics, recover hijacked registries, and deploy security hardening measures and endpoint protection.",
    features: ["Forensic Malware Detection", "Spyware & Trojan Purging", "Registry Reconstruction", "Real-time Defenses Deployment"],
    icon: Bug,
    color: "from-red-500 to-amber-600",
    gradient: "via-red-500/10",
    glow: "rgba(239, 68, 68, 0.2)",
    labStats: [
      { label: "Scan Depth", value: "300K+ Files" },
      { label: "Clear Rate", value: "100%" }
    ],
    category: 'Security'
  },
  {
    id: 12,
    title: "Blue Screen of Death (BSOD) Repair",
    desc: "Crash analysis and operating system stabilization",
    shortDesc: "Kernel dump diagnosis and operating system stabilization.",
    fullDesc: "Kernel dump diagnosis to pinpoint hardware conflicts, corrupted system files, or driver discrepancies causing fatal system halts (BSOD). We restore stability without data loss.",
    features: ["BSOD Dump Analysis", "Driver Mismatch Correction", "System Integrity Restores", "RAM Fault Diagnosis"],
    icon: Activity,
    color: "from-blue-500 to-indigo-650",
    gradient: "via-blue-500/10",
    glow: "rgba(59, 130, 246, 0.2)",
    labStats: [
      { label: "Resolution", value: "<2h Typical" },
      { label: "OS Stability", value: "99.2%" }
    ],
    category: 'Software'
  },
  {
    id: 13,
    title: "Software Installation",
    desc: "Seamless suite provisioning and license configuration",
    shortDesc: "Custom deployment of professional applications.",
    fullDesc: "Clean installation and calibration of professional productivity software, specialized development frameworks, IDEs, and office environments. We resolve licensing, compatibility issues, and runtime dependencies.",
    features: ["Professional Suites Setup", "IDE/SDK Environments", "Dependency Verification", "Licensing Configuration"],
    icon: Download,
    color: "from-neon-cyan to-teal-600",
    gradient: "via-neon-cyan/10",
    glow: "rgba(6, 182, 212, 0.2)",
    labStats: [
      { label: "Supported Suites", value: "150+" },
      { label: "Verification", value: "Instant" }
    ],
    category: 'Software'
  },
  {
    id: 14,
    title: "Operating System Installation",
    desc: "Fresh OS deployment, updates, and driver configurations",
    shortDesc: "Fresh OS installation with full updates and driver packs.",
    fullDesc: "Bare-metal installation of Windows, macOS, or Linux. Includes partition layout customization, BIOS/UEFI secure boot configuration, full driver mapping, and security update provisioning.",
    features: ["System Reimaging", "Secure Boot Configuration", "Custom Partitioning", "Latest Update Rollouts"],
    icon: Terminal,
    color: "from-zinc-500 to-slate-600",
    gradient: "via-zinc-500/10",
    glow: "rgba(113, 113, 122, 0.2)",
    labStats: [
      { label: "Deployment Time", value: "45 mins" },
      { label: "Security Updates", value: "Fully Patched" }
    ],
    category: 'Software'
  },
  {
    id: 15,
    title: "Hardware Installation & Upgrades",
    desc: "Component transplants and performance enhancements",
    shortDesc: "Speed up your device with SSD, RAM and GPU upgrades.",
    fullDesc: "Upgrade and install high-performance RAM modules, blazing-fast NVMe SSDs, discrete graphics cards, power supplies, or cooling systems to prolong the lifecycle of your hardware assets.",
    features: ["NVMe SSD Transplants", "High-capacity RAM Upgrades", "GPU & PSU Replacements", "BIOS & Firmware Patches"],
    icon: PlusCircle,
    color: "from-purple-500 to-violet-650",
    gradient: "via-purple-500/10",
    glow: "rgba(168, 85, 247, 0.2)",
    labStats: [
      { label: "Performance Gain", value: "Up to 5x" },
      { label: "Parts Warranty", value: "3 Years" }
    ],
    category: 'Hardware'
  },
  {
    id: 16,
    title: "Slow & Hanging Computer Optimization",
    desc: "Speed optimization and junk removal",
    shortDesc: "Reclaim lost system speed with advanced tuning.",
    fullDesc: "Reclaim lost system speed by cleaning cache structures, disabling heavy startup items, adjusting page file sizes, cleaning thermal channels, and configuring efficient OS scheduling protocols.",
    features: ["Startup Bottleneck Purge", "Cache & Temp Clean", "Resource Load Balancing", "Scheduler Optimization"],
    icon: Zap,
    color: "from-emerald-500 to-green-600",
    gradient: "via-emerald-500/10",
    glow: "rgba(16, 185, 129, 0.2)",
    labStats: [
      { label: "Boot Time Saved", value: "-60%" },
      { label: "RAM Recaptured", value: "+30%" }
    ],
    category: 'Software'
  },
  {
    id: 17,
    title: "Regular Computer Checkups & Maintenance",
    desc: "Preventative tune-ups and diagnostic assessments",
    shortDesc: "Keep your system running smoothly year-round.",
    fullDesc: "Comprehensive periodic maintenance that includes physical dust cleaning, software updates, diagnostic stress tests, component temperature logging, and hardware health reports.",
    features: ["Physical Dust De-clogging", "Thermal Paste Refresh", "Diagnostic Stress Testing", "Hardware Health Audit"],
    icon: Settings,
    color: "from-orange-500 to-yellow-600",
    gradient: "via-orange-500/10",
    glow: "rgba(249, 115, 22, 0.2)",
    labStats: [
      { label: "Frequency", value: "6 Months" },
      { label: "Longevity Yield", value: "+40%" }
    ],
    category: 'Hardware'
  },
  {
    id: 18,
    title: "Custom PC Build & Upgrade Services",
    desc: "Bespoke computer architecture for gaming and workstations",
    shortDesc: "Custom rigs built for gaming, editing, or rendering.",
    fullDesc: "We design and assemble custom computer systems optimized for your specific workloads—whether it is 4K gaming, 3D rendering, machine learning, or software development.",
    features: ["Workstation Architecture Design", "Aesthetic Cable Routing", "Overclock Integration", "Liquid Cooling Configuration"],
    icon: Sliders,
    color: "from-pink-500 to-rose-650",
    gradient: "via-pink-500/10",
    glow: "rgba(236, 72, 153, 0.2)",
    labStats: [
      { label: "Stress Testing", value: "24 Hours" },
      { label: "Build Warranty", value: "1 Year" }
    ],
    category: 'Hardware'
  }
];
