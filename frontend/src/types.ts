export type Role = 'MANAGER' | 'MIXING_OFFICER' | 'SYSTEM_ADMIN' | 'STORES_OFFICER' | 'LAB_OFFICER'

export interface User {
  id: number
  fullName: string
  email: string
  role: Role
  active: boolean
}

export interface Ingredient {
  id: number
  materialCode: string
  materialName: string
  requiredQuantity: number
  unit: string
  additionSequence: number
  stageNumber: number
  mixingTimeSeconds?: number
  temperatureCelsius?: number
  speedRpm?: number
  instructions?: string
}

export interface RecipeRevision {
  id: number
  recipeId: number
  recipeCode: string
  compoundName: string
  revisionNumber: string
  effectiveDate: string
  lastUpdatedDate: string
  status: 'DRAFT' | 'ACTIVE' | 'OBSOLETE'
  createdBy: User
  approvedBy?: User
  approvedAt?: string
  revisionNotes?: string
  ingredients: Ingredient[]
}

export type BatchStatus =
  | 'PLANNED' | 'WAITING_FOR_MATERIALS' | 'MATERIALS_REQUESTED' | 'MATERIALS_ISSUED'
  | 'READY_FOR_STAGE_1' | 'STAGE_1_IN_PROGRESS' | 'STAGE_1_COMPLETED'
  | 'READY_FOR_STAGE_2' | 'STAGE_2_IN_PROGRESS' | 'STAGE_2_COMPLETED'
  | 'SAMPLE_SENT_TO_LAB' | 'WAITING_FOR_LAB' | 'LAB_PASSED' | 'LAB_FAILED'
  | 'ON_HOLD' | 'RETEST_REQUIRED' | 'REPROCESSING' | 'RELEASED_TO_BLANKING'
  | 'STOPPED' | 'CANCELLED'

export interface Batch {
  id: number
  batchNumber: string
  factoryReference: string
  recipeRevisionId: number
  recipeCode: string
  compoundName: string
  revisionNumber: string
  plannedQuantityKg: number
  actualOutputQuantityKg?: number
  machine: string
  assignedOfficer: User
  createdAt: string
  status: BatchStatus
  currentStage: number
  issueOrStoppageReason?: string
  reprocessingSourceBatchId?: number
  reprocessingSourceBatchNumber?: string
  laboratoryStatus: 'PENDING' | 'PASS' | 'FAIL' | 'HOLD' | 'RETEST'
  releaseStatus: 'NOT_READY' | 'PENDING_APPROVAL' | 'APPROVED_FOR_BLANKING' | 'REPROCESSING_REQUIRED' | 'BLOCKED'
  traceabilityCode: string
  stage1StartedAt?: string
  stage1CompletedAt?: string
  stage2StartedAt?: string
  stage2CompletedAt?: string
}

export interface StatusHistory {
  id: number
  previousStatus?: BatchStatus
  newStatus: BatchStatus
  changedBy: User
  changedAt: string
  reason?: string
}

export interface Stage {
  id: number
  batchId: number
  batchNumber: string
  factoryReference: string
  stageNumber: number
  startTime?: string
  endTime?: string
  officer: User
  machine: string
  plannedQuantity: number
  actualQuantity?: number
  temperatureCelsius?: number
  mixingTimeSeconds?: number
  speedRpm?: number
  notes?: string
  completionStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED' | 'OVERRIDDEN'
  managerOverride: boolean
  overrideReason?: string
  pauseEvents: Array<{
    id: number
    pausedAt: string
    resumedAt?: string
    reason: string
    recordedBy: User
  }>
}

export interface MaterialRequest {
  id: number
  requestNumber: string
  batchId: number
  batchNumber: string
  recipeCode: string
  revisionNumber: string
  requestingOfficer: User
  requestedAt: string
  status: 'DRAFT' | 'REQUESTED' | 'PARTIALLY_ISSUED' | 'ISSUED' | 'CANCELLED'
  notes?: string
  issuedBy?: User
  issuedAt?: string
  items: Array<{
    id: number
    materialCode: string
    materialName: string
    requiredQuantity: number
    requestedQuantity: number
    issuedQuantity: number
    unit: string
    rawMaterialLotNumber?: string
  }>
}

export interface LabSample {
  id: number
  sampleId: string
  batchId: number
  batchNumber: string
  recipeCode: string
  revisionNumber: string
  sentToLabAt: string
  testDateTime?: string
  hardness?: number
  resilience?: number
  curingTimeMinutes?: number
  decision: 'PENDING' | 'PASS' | 'FAIL' | 'HOLD' | 'RETEST'
  testedBy?: User
  comments?: string
  reprocessingDecision: boolean
  managerApprovedBy?: User
  managerApprovedAt?: string
  additionalResults: Array<{ id: number; testName: string; resultValue: string; unit?: string }>
}

export interface Issue {
  id: number
  batchId?: number
  batchNumber?: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  subject: string
  status: 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
  createdBy: User
  assignedManager?: User
  unreadByManager: boolean
  unreadByOfficer: boolean
  createdAt: string
  updatedAt: string
  messages: Array<{ id: number; sender: User; message: string; sentAt: string }>
}

export interface Notification {
  id: number
  type: string
  title: string
  message: string
  referenceType?: string
  referenceId?: number
  read: boolean
  createdAt: string
}

export interface Audit {
  id: number
  actor?: User
  action: string
  entityType: string
  entityId?: number
  previousValue?: string
  newValue?: string
  actionTime: string
  relatedBatchId?: number
  relatedRecipeId?: number
}

export interface DashboardSummary {
  activeBatches: number
  waitingForMaterials: number
  waitingForLab: number
  passedBatches: number
  failedBatches: number
  stoppedOrDelayed: number
  unreadIssues: number
  activeBatchDetails: Batch[]
  batchBoard: Batch[]
  recentActivity: Audit[]
}
