"use client";

import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  containerClassName?: string;
}

export default function PasswordInput({
  label,
  className,
  containerClassName,
  ...props
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className={containerClassName}>
      {label && <label htmlFor={props.id} className="gf-label">{label}</label>}
      <div className="relative">
        <input
          {...props}
          type={showPassword ? "text" : "password"}
          className={[
            "gf-input pr-12",
            className
          ]
            .filter(Boolean)
            .join(" ")}
        />
        <button
          type="button"
          onClick={() => setShowPassword((prev) => !prev)}
          className="absolute inset-y-0 right-0 flex items-center rounded-r-xl px-3.5 text-slate-400 hover:text-slate-600"
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? (
            <EyeOff className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Eye className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}
