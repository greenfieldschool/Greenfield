"use client";

import type { ComponentProps } from "react";

/** A <select> that submits its form as soon as a choice is made (filters on phones: no extra "Find" tap). */
export default function AutoSubmitSelect(props: Omit<ComponentProps<"select">, "onChange">) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
