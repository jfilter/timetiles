/**
 * Simplified header for Payload admin.
 *
 * Displays branding, back to site link, and theme toggle
 * above the Payload admin header for a unified experience.
 *
 * Note: Uses inline styles because Tailwind is not available
 * in the Payload admin panel context.
 *
 * @module
 * @category Admin
 */
"use client";

import { useTheme } from "@payloadcms/ui";
import LogoDark from "@timetiles/assets/logos/latest/dark/transparent/png/wordmark_compact_256.png";
import LogoLight from "@timetiles/assets/logos/latest/light/transparent/png/wordmark_compact_256.png";
import { ArrowLeft, Moon, Sun } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { adminColors } from "@/lib/constants/admin-styles";
import { useMounted } from "@/lib/hooks/use-theme";

const STORAGE_KEY = "timetiles-theme";

// Styles defined outside component (Tailwind unavailable in Payload admin panel)
const styles = {
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 24px",
    borderBottom: `1px solid ${adminColors.border}`,
    background: adminColors.bg,
  },
  leftSection: { display: "flex", alignItems: "center", gap: "12px" },
  logoImage: { borderRadius: "4px" },
  brandText: { fontSize: "16px", fontWeight: 600, color: adminColors.text },
  dashboardBadge: { marginLeft: "8px", fontSize: "12px", fontWeight: 400, color: adminColors.textMuted },
  rightSection: { display: "flex", alignItems: "center", gap: "16px" },
  backLink: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "14px",
    color: adminColors.textInteractive,
    textDecoration: "none",
  },
  themeButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "8px",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    borderRadius: "4px",
    color: adminColors.textInteractive,
  },
} as const;

const AdminHeader = () => {
  const t = useTranslations("Admin");
  const tCommon = useTranslations("Common");
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    // Payload's useTheme() manages the admin panel theme independently.
    // Write to the main app's localStorage key so the frontend theme stays in sync.
    localStorage.setItem(STORAGE_KEY, newTheme);
  };

  const logo = theme === "dark" ? LogoDark : LogoLight;

  return (
    <header style={styles.header}>
      {/* Left: Logo + Brand */}
      <div style={styles.leftSection}>
        <Image src={logo} alt="TimeTiles" width={32} height={32} style={styles.logoImage} />
        <span style={styles.brandText}>
          {/* eslint-disable-next-line i18next/no-literal-string -- brand name */}
          {"TimeTiles "}
          <span style={styles.dashboardBadge}>{tCommon("dashboard")}</span>
        </span>
      </div>

      {/* Right: Actions */}
      <div style={styles.rightSection}>
        {/* Back to Site */}
        <Link href="/" style={styles.backLink}>
          <ArrowLeft size={16} />
          {t("backToSite")}
        </Link>

        {/* Theme Toggle */}
        {mounted && (
          <button
            type="button"
            onClick={toggleTheme}
            style={styles.themeButton}
            title={theme === "dark" ? t("switchToLightMode") : t("switchToDarkMode")}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        )}
      </div>
    </header>
  );
};

export default AdminHeader;
