import { useCallback, useState } from 'react';
import type { ZodType } from 'zod';

/**
 * Small form-state hook validated by a Zod schema (react-hook-form style API,
 * without the dependency): values, per-field errors, set(), submit().
 */
export function useZodForm<T extends Record<string, unknown>>(schema: ZodType<T>, initial: T) {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const validate = useCallback(
    (v: T) => {
      const r = schema.safeParse(v);
      if (r.success) return {};
      const errs: Record<string, string> = {};
      for (const issue of r.error.issues) {
        const key = issue.path.join('.');
        if (!errs[key]) errs[key] = issue.message;
      }
      return errs;
    },
    [schema],
  );

  const set = useCallback(
    <K extends keyof T>(key: K, value: T[K]) => {
      setValues((prev) => {
        const next = { ...prev, [key]: value };
        if (submitted) setErrors(validate(next));
        return next;
      });
    },
    [submitted, validate],
  );

  const patch = useCallback((p: Partial<T>) => {
    setValues((prev) => {
      const next = { ...prev, ...p };
      if (submitted) setErrors(validate(next));
      return next;
    });
  }, [submitted, validate]);

  /** Returns parsed data when valid, otherwise null and shows errors. */
  const submit = useCallback((): T | null => {
    setSubmitted(true);
    const errs = validate(values);
    setErrors(errs);
    if (Object.keys(errs).length) return null;
    return schema.parse(values);
  }, [schema, validate, values]);

  const err = (key: keyof T | string): string | undefined => errors[String(key)];

  return { values, set, patch, submit, err, errors, setValues };
}
