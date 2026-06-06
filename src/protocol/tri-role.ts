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
};

export type ValidationError = {
  path: string;
  message: string;
};

export function validateTriRoleProfile(obj: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!isRecord(obj)) {
    return [{ path: "", message: "不是有效的对象" }];
  }

  const p = obj;
  for (const key of Object.keys(p)) {
    if (!isAllowedTopLevelKey(key)) {
      errors.push({ path: key, message: "不支持的字段" });
    }
  }

  // Required protocol field
  if (p.protocol !== "tri-role/v1") {
    errors.push({ path: "protocol", message: "必须是 'tri-role/v1'" });
  }

  // Required profile_id
  if (typeof p.profile_id !== "string" || !p.profile_id) {
    errors.push({ path: "profile_id", message: "缺少 profile_id" });
  } else if (!isProfileId(p.profile_id)) {
    errors.push({ path: "profile_id", message: "只能包含字母、数字、下划线和连字符" });
  }

  if (p.name !== undefined) {
    if (typeof p.name !== "string") {
      errors.push({ path: "name", message: "必须是字符串" });
    } else if (hasLineBreak(p.name)) {
      errors.push({ path: "name", message: "不能包含换行" });
    }
  }

  // Required roles
  const roles = p.roles;
  if (!isRecord(roles)) {
    errors.push({ path: "roles", message: "缺少 roles" });
  } else {
    for (const key of Object.keys(roles)) {
      if (!isModelRole(key)) {
        errors.push({ path: `roles.${key}`, message: "不支持的字段" });
      }
    }
    for (const role of ["primary", "reasoning", "fast"]) {
      const r = roles[role];
      if (!isRecord(r)) {
        errors.push({ path: `roles.${role}`, message: `缺少 roles.${role}` });
      } else {
        for (const key of Object.keys(r)) {
          if (key !== "model") {
            errors.push({ path: `roles.${role}.${key}`, message: "不支持的字段" });
          }
        }
        if (typeof r.model !== "string" || !r.model) {
          errors.push({ path: `roles.${role}.model`, message: `缺少有效的 ${role} model ID` });
        } else if (!isModelReference(r.model)) {
          errors.push({ path: `roles.${role}.model`, message: "model ID 包含不安全字符" });
        }
      }
    }
  }

  // Optional compaction validation
  const compaction = p.compaction;
  if (compaction !== undefined) {
    if (!isRecord(compaction)) {
      errors.push({ path: "compaction", message: "必须是对象" });
      return errors;
    }
    for (const key of Object.keys(compaction)) {
      if (!isAllowedCompactionKey(key)) {
        errors.push({ path: `compaction.${key}`, message: "不支持的字段" });
      }
    }
    if (compaction.threshold !== undefined && typeof compaction.threshold !== "number") {
      errors.push({ path: "compaction.threshold", message: "threshold 必须是数字" });
    }
    if (compaction.max_input_tokens !== undefined && typeof compaction.max_input_tokens !== "number") {
      errors.push({ path: "compaction.max_input_tokens", message: "max_input_tokens 必须是数字" });
    }
    if (compaction.model_role !== undefined) {
      if (typeof compaction.model_role !== "string" || !compaction.model_role) {
        errors.push({ path: "compaction.model_role", message: "缺少有效的 model_role" });
      } else if (!isModelReference(compaction.model_role)) {
        errors.push({ path: "compaction.model_role", message: "model_role 包含不安全字符" });
      }
    }
    if (typeof compaction.threshold === "number" && typeof compaction.max_input_tokens === "number") {
      if (compaction.threshold > compaction.max_input_tokens) {
        errors.push({ path: "compaction", message: "threshold 不能超过 max_input_tokens" });
      }
    }
  }

  return errors;
}

function isAllowedTopLevelKey(key: string): boolean {
  return key === "protocol" || key === "profile_id" || key === "name" || key === "roles" || key === "compaction";
}

function isAllowedCompactionKey(key: string): boolean {
  return key === "threshold" || key === "max_input_tokens" || key === "model_role";
}

function isModelRole(key: string): boolean {
  return key === "primary" || key === "reasoning" || key === "fast";
}

function isProfileId(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

function isModelReference(value: string): boolean {
  return /^[A-Za-z0-9._/-]+$/.test(value);
}

function hasLineBreak(value: string): boolean {
  return /[\r\n]/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
