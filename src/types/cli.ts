export type ProviderGroupMap = Record<string, string>;

export type CliOptions = {
  force: boolean;
  dryRun: boolean;
  checkOnly: boolean;
  providerGroups: ProviderGroupMap;
};
