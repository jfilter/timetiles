/**
 * German email translation strings.
 *
 * @module
 * @category Email
 */
/* eslint-disable sonarjs/no-hardcoded-passwords -- translation keys referencing "password" are not credentials */
import type en from "./en";

const de: Record<keyof typeof en, string> = {
  // Shared layout
  footer: "Dies ist eine automatische Nachricht von TimeTiles. Bei Fragen wenden Sie sich bitte an den Support.",
  greeting: "Hallo {name},",
  greetingAnonymous: "Hallo,",
  orCopyLink: "Oder kopieren Sie diesen Link in Ihren Browser:",

  // Shared button labels
  verifyEmailBtn: "E-Mail bestätigen",
  resetPasswordBtn: "Passwort zurücksetzen",
  cancelDeletionBtn: "Löschung abbrechen",
  downloadDataBtn: "Meine Daten herunterladen",
  tryAgainBtn: "Erneut versuchen",

  // Verify account (Payload auth)
  verifyAccountSubject: "Bestätigen Sie Ihr TimeTiles-Konto",
  verifyAccountTitle: "Bestätigen Sie Ihr TimeTiles-Konto",
  verifyAccountBody:
    "Vielen Dank für Ihre Registrierung bei TimeTiles. Bitte bestätigen Sie Ihre E-Mail-Adresse, indem Sie auf den folgenden Link klicken:",
  verifyAccountIgnore: "Wenn Sie kein Konto erstellt haben, können Sie diese E-Mail ignorieren.",

  // Reset password (Payload auth)
  resetPasswordSubject: "TimeTiles-Passwort zurücksetzen",
  resetPasswordTitle: "Passwort zurücksetzen",
  resetPasswordBody:
    "Sie haben eine Passwortzurücksetzung angefordert. Klicken Sie auf den folgenden Link, um ein neues Passwort festzulegen:",
  resetPasswordExpiry: "Dieser Link ist 1 Stunde gültig.",
  resetPasswordIgnore: "Wenn Sie keine Passwortzurücksetzung angefordert haben, können Sie diese E-Mail ignorieren.",

  // Email changed — old address notification
  emailChangedSubject: "Ihre TimeTiles-E-Mail-Adresse wurde geändert",
  emailChangedTitle: "Ihre E-Mail-Adresse wurde geändert",
  emailChangedBody: "Die E-Mail-Adresse Ihres TimeTiles-Kontos wurde kürzlich geändert.",
  emailChangedWarning:
    "Wenn Sie diese Änderung nicht vorgenommen haben, kontaktieren Sie bitte umgehend den Support, um Ihr Konto zu sichern.",

  // Email changed — new address verification
  emailVerifySubject: "Bestätigen Sie Ihre neue TimeTiles-E-Mail-Adresse",
  emailVerifyTitle: "Neue E-Mail-Adresse bestätigen",
  emailVerifyBody:
    "Sie haben kürzlich Ihre E-Mail-Adresse bei TimeTiles geändert. Bitte bestätigen Sie Ihre neue E-Mail-Adresse, indem Sie auf den folgenden Link klicken:",
  emailVerifyWarning: "Wenn Sie Ihre E-Mail-Adresse nicht geändert haben, kontaktieren Sie bitte umgehend den Support.",

  // Account exists (anti-enumeration)
  accountExistsSubject: "TimeTiles – Registrierungsversuch",
  accountExistsTitle: "Registrierungsversuch",
  accountExistsBody:
    "Jemand (möglicherweise Sie) hat versucht, ein TimeTiles-Konto mit dieser E-Mail-Adresse zu erstellen.",
  accountExistsExplain: "Da Sie bereits ein Konto haben, wurde kein neues Konto erstellt.",
  accountExistsIfYou: "Falls Sie es waren:",
  accountExistsForgot: "Möglicherweise haben Sie vergessen, dass Sie bereits ein Konto haben",
  accountExistsReset: "Wenn Sie Ihr Passwort vergessen haben, können Sie es unten zurücksetzen",
  accountExistsIfNot: "Falls Sie es nicht waren:",
  accountExistsIgnore:
    "Sie können diese E-Mail bedenkenlos ignorieren. Ihr Konto ist sicher und es wurden keine Änderungen vorgenommen.",

  // Deletion scheduled
  deletionScheduledSubject: "Ihre TimeTiles-Kontolöschung ist geplant",
  deletionScheduledTitle: "Kontolöschung geplant",
  deletionScheduledBody: "Die Löschung Ihres TimeTiles-Kontos wurde geplant.",
  deletionScheduledDate: "Löschungsdatum:",
  deletionScheduledNext: "Was passiert als Nächstes?",
  deletionScheduledPublic: "Öffentliche Daten werden an das System übertragen und bleiben zugänglich",
  deletionScheduledPrivate: "Private Daten werden am geplanten Datum unwiderruflich gelöscht",
  deletionScheduledCancel: "Sie können diese Löschung jederzeit vor dem geplanten Datum abbrechen",
  deletionScheduledWarning:
    "Wenn Sie diese Löschung nicht angefordert haben, brechen Sie sie bitte sofort ab und sichern Sie Ihr Konto.",
  deletionScheduledLink: "Oder besuchen Sie Ihre Kontoeinstellungen:",

  // Deletion cancelled
  deletionCancelledSubject: "Ihre TimeTiles-Kontolöschung wurde abgebrochen",
  deletionCancelledTitle: "Kontolöschung abgebrochen",
  deletionCancelledBody: "Gute Nachrichten! Die Löschung Ihres TimeTiles-Kontos wurde abgebrochen.",
  deletionCancelledActive: "Ihr Konto ist jetzt wieder <strong>aktiv</strong> und alle Ihre Daten sind sicher.",
  deletionCancelledWarning:
    "Wenn Sie die Löschung nicht abgebrochen haben, hat möglicherweise jemand Zugriff auf Ihr Konto. Wir empfehlen:",
  deletionCancelledChangePassword: "Ändern Sie sofort Ihr Passwort",
  deletionCancelledReviewActivity: "Überprüfen Sie Ihre letzten Kontoaktivitäten",

  // Deletion completed
  deletionCompletedSubject: "Ihr TimeTiles-Konto wurde gelöscht",
  deletionCompletedTitle: "Ihr TimeTiles-Konto wurde gelöscht",
  deletionCompletedBody: "Ihr TimeTiles-Konto wurde wie geplant unwiderruflich gelöscht.",
  deletionCompletedSummary: "Zusammenfassung der Änderungen",
  deletionCompletedTransferred: "Öffentliche Daten übertragen",
  deletionCompletedTransferredNote: "Diese Daten bleiben öffentlich zugänglich.",
  deletionCompletedDeleted: "Private Daten gelöscht",
  deletionCompletedDeletedNote: "Diese Daten wurden unwiderruflich entfernt.",
  deletionCompletedCatalogs: "{count} Katalog(e)",
  deletionCompletedDatasets: "{count} Datensatz/Datensätze",
  deletionCompletedEvents: "{count} Ereignis(se)",
  deletionCompletedPrivateCatalogs: "{count} private(r) Katalog(e)",
  deletionCompletedPrivateDatasets: "{count} private(r) Datensatz/Datensätze",
  deletionCompletedThanks:
    "Vielen Dank, dass Sie TimeTiles genutzt haben. Bei Fragen zu Ihren Daten wenden Sie sich bitte innerhalb von 30 Tagen an den Support.",

  // Export ready
  exportReadySubject: "Ihr TimeTiles-Datenexport ist bereit",
  exportReadyTitle: "Ihr Datenexport ist bereit",
  exportReadyBody: "Gute Nachrichten! Ihr TimeTiles-Datenexport wurde abgeschlossen und steht zum Download bereit.",
  exportReadyDetails: "Export-Details",
  exportReadySize: "Größe:",
  exportReadyExpires: "Gültig bis:",
  exportReadySettings: "Oder besuchen Sie Ihre Kontoeinstellungen:",
  exportReadyIncludes: "Was ist enthalten?",
  exportReadyProfile: "Ihre Profilinformationen",
  exportReadyCatalogs: "Alle von Ihnen erstellten Kataloge",
  exportReadyDatasets: "Alle Datensätze und deren Konfigurationen",
  exportReadyEvents: "Alle Ereignisse in Ihren Datensätzen",
  exportReadyImports: "Importverlauf und geplante Importe",
  exportReadyMedia: "Von Ihnen hochgeladene Mediendateien",
  exportReadyExpiry:
    "Dieser Download-Link ist 7 Tage gültig. Danach müssen Sie einen neuen Export in Ihren Kontoeinstellungen anfordern.",
  exportReadySecurityWarning:
    "Wenn Sie diesen Export nicht angefordert haben, sichern Sie bitte Ihr Konto, indem Sie Ihr Passwort ändern.",

  // Export failed
  exportFailedSubject: "Ihr TimeTiles-Datenexport konnte nicht abgeschlossen werden",
  exportFailedTitle: "Datenexport fehlgeschlagen",
  exportFailedBody:
    "Leider konnte Ihr Datenexport nicht abgeschlossen werden. Dies kann auf ein vorübergehendes technisches Problem zurückzuführen sein.",
  exportFailedError: "Fehler:",
  exportFailedActions: "Was Sie tun können:",
  exportFailedRetry: "Besuchen Sie Ihre Kontoeinstellungen und versuchen Sie es erneut",
  exportFailedContact: "Wenn das Problem weiterhin besteht, kontaktieren Sie bitte den Support",
  exportFailedApology: "Wir entschuldigen uns für die Unannehmlichkeiten.",
} as const;

export default de;
