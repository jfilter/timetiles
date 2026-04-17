/**
 * Shared form field component for auth forms.
 *
 * Combines Label and Input with consistent spacing, reducing
 * repetitive markup across login, register, and password forms.
 *
 * @module
 * @category Components
 */
import { Input, Label } from "@timetiles/ui";

interface AuthFormFieldProps {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  autoComplete?: string;
  minLength?: number;
  maxLength?: number;
}

export const AuthFormField = ({ id, label, ...props }: AuthFormFieldProps) => (
  <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <Input id={id} {...props} />
  </div>
);
