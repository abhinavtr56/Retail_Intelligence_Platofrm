import type { PortalConnector } from '../../types/portal'

// Ported verbatim from js/portal.js's CONNECTORS catalog.
export const INITIAL_CONNECTORS: PortalConnector[] = [
  { key: 'sap', name: 'SAP S/4HANA', desc: 'Sales, pricing, claims — via OData', logo: 'sap', on: false, special: 'sap' },
  { key: 'niq', name: 'NielsenIQ', desc: 'Market & scanner data — custom endpoint', logo: 'nielsen', on: false, special: 'nielsen' },
  { key: 'pbi', name: 'Power BI', desc: 'Existing dashboards & reports', logo: 'powerbi', on: false, special: 'powerbi' },
  { key: 'xls', name: 'Excel / Shared Drives', desc: 'Promotion planning files', logo: 'excel', on: true, upload: true },
  { key: 'azure', name: 'Azure Blob Storage', desc: 'Blob containers & Data Lake files', logo: 'azure', on: false, special: 'azure' },
  { key: 'databricks', name: 'Databricks', desc: 'SQL warehouses & Delta tables', logo: 'databricks', on: false, special: 'databricks' },
]
