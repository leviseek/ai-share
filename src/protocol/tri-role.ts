export type TriRoleProfile = {
  protocol: "tri-role/v1";
  profile_id: string;
  name?: string;
  roles: {
    primary: { model: string };
    reasoning: { model: string };
    fast: { model: string };
  };
  compaction?: {
    threshold?: number;
    max_input_tokens?: number;
    model_role?: string;
  };
  strategies?: Record<string, unknown>;
};

export type ValidationError = {
  path: string;
  message: string;
};

export function validateTriRoleProfile(obj: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!obj || typeof obj !== "object") {
    return [{ path: "", message: "不是有效的对象" }];
  }

  const p = obj as Record<string, unknown>;

  // Required protocol field
  if (p.protocol !== "tri-role/v1") {
    errors.push({ path: "protocol", message: "必须是 'tri-role/v1'" });
  }

  // Required profile_id
  if (typeof p.profile_id !== "string" || !p.profile_id) {
    errors.push({ path: "profile_id", message: "缺少 profile_id" });
  }

  // Required roles
  const roles = p.roles as Record<string, unknown> | undefined;
  if (!roles || typeof roles !== "object") {
    errors.push({ path: "roles", message: "缺少 roles" });
  } else {
    for (const role of ["primary", "reasoning", "fast"]) {
      const r = roles[role] as Record<string, unknown> | undefined;
      if (!r || typeof r !== "object") {
        errors.push({ path: `roles.${role}`, message: `缺少 roles.${role}` });
      } else if (typeof r.model !== "string" || !r.model) {
        errors.push({ path: `roles.${role}.model`, message: `缺少有效的 ${role} model ID` });
      }
    }
  }

  // Optional compaction validation
  const compaction = p.compaction as Record<string, unknown> | undefined;
  if (compaction) {
    if (compaction.threshold !== undefined && typeof compaction.threshold !== "number") {
      errors.push({ path: "compaction.threshold", message: "threshold 必须是数字" });
    }
    if (compaction.max_input_tokens !== undefined && typeof compaction.max_input_tokens !== "number") {
      errors.push({ path: "compaction.max_input_tokens", message: "max_input_tokens 必须是数字" });
    }
    if (compaction.threshold !== undefined && compaction.max_input_tokens !== undefined) {
      if (Number(compaction.threshold) > Number(compaction.max_input_tokens)) {
        errors.push({ path: "compaction", message: "threshold 不能超过 max_input_tokens" });
      }
    }
  }

  return errors;
}
