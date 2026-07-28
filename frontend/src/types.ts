export type Role =
  | 'MANAGER'
  | 'MIXING_OFFICER'
  | 'SYSTEM_ADMIN'
  | 'STORES_OFFICER'
  | 'LAB_OFFICER'
  | 'BLANKING_OPERATOR'
  | 'BLANKING_SUPERVISOR'
  | 'MOULDING_OPERATOR'
  | 'MOULDING_SUPERVISOR'

export interface User {
  id: number
  fullName: string
  employeeId?: string
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

export type ProductionShift = 'SHIFT_A' | 'SHIFT_B' | 'SHIFT_C'

export interface ShiftContext {
  productionDate: string
  shift: ProductionShift
  serverTime: string
  shiftStart: string
  shiftEnd: string
}

export interface ApprovedMaterialBatch {
  id: number
  mixingBatchId?: number
  labApprovalId?: number
  mixingBatchNumber: string
  materialCode: string
  compoundName: string
  labStatus: 'PENDING' | 'PASS' | 'FAIL' | 'HOLD' | 'RETEST'
  approvedQuantityKg: number
  availableQuantityKg: number
  approvedAt: string
  notes?: string
  active: boolean
}

export type BlankingBatchStatus =
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'READY'
  | 'PARTIALLY_DISPATCHED'
  | 'FULLY_DISPATCHED'
  | 'CLOSED'

export interface BlankingBatch {
  id: number
  batchNumber: string
  approvedMaterialBatchId: number
  mixingBatchNumber: string
  materialCode: string
  materialConsumedKg: number
  plannedProductionQuantity: number
  productionQuantity?: number
  rejectedQuantity: number
  availableGoodBlankQuantity: number
  productionDate: string
  shift: ProductionShift
  startTime?: string
  endTime?: string
  operator: User
  operatorEmployeeId: string
  notes?: string
  status: BlankingBatchStatus
  createdAt: string
  updatedAt: string
}

export type BlankingCartStatus =
  | 'PREPARED'
  | 'DISPATCHED'
  | 'RECEIVED_AT_MOULDING'
  | 'PARTIALLY_CONSUMED'
  | 'FULLY_CONSUMED'

export interface BlankingCart {
  id: number
  cartNumber: string
  blankingBatchId: number
  blankingBatchNumber: string
  mixingBatchNumber: string
  materialCode: string
  quantity: number
  remainingQuantity: number
  createdAt: string
  createdBy: User
  destinationPressId: number
  destinationPressNumber: string
  destinationPressName: string
  dispatchedAt?: string
  dispatchedBy?: User
  status: BlankingCartStatus
  blankingNote?: string
}

export type PressStatus = 'IDLE' | 'WAITING_FOR_BLANKS' | 'RUNNING' | 'STOPPED' | 'MAINTENANCE'

export interface Press {
  id: number
  pressNumber: string
  pressName: string
  status: PressStatus
  currentShift: ProductionShift
  currentOperator?: User
  currentBlankingBatchId?: number
  currentBlankingBatchNumber?: string
  availableBlankQuantity: number
  goodTyreQuantity: number
  rejectedTyreQuantity: number
  rejectedBlankQuantity: number
  cartsWaitingToBeReceived: number
  estimatedNextBlankRequirement: number
  lastActivityAt?: string
  active: boolean
}

export interface CartReceipt {
  id: number
  cartId: number
  cartNumber: string
  blankingBatchNumber: string
  receivedQuantity: number
  productionDate: string
  shift: ProductionShift
  receivedAt: string
  receivingOperator: User
  receivingOperatorEmployeeId: string
  pressId: number
  pressNumber: string
  sendingOperator: User
  dispatchTime: string
  receiptStatus: 'RECEIVED' | 'RECEIVED_WITH_OVERRIDE'
  overrideReason?: string
}

export interface MouldingProductionRecord {
  id: number
  pressId: number
  pressNumber: string
  productionDate: string
  shift: ProductionShift
  startTime: string
  endTime?: string
  operator: User
  operatorEmployeeId: string
  cartId: number
  cartNumber: string
  blankingBatchId: number
  blankingBatchNumber: string
  quantityReceived: number
  goodTyreQuantity: number
  rejectedTyreQuantity: number
  rejectedTyreWeightPerItemGrams: number
  totalRejectedTyreWeightGrams: number
  rejectedBlankQuantity: number
  remainingBlankQuantity: number
  downtimeMinutes: number
  downtimeReason?: string
  operatorNote?: string
  status: 'IN_PROGRESS' | 'COMPLETED'
  createdAt: string
  updatedAt: string
}

export type ShortageStatus =
  | 'OPEN'
  | 'ACKNOWLEDGED'
  | 'PREPARING'
  | 'DISPATCHED'
  | 'FULFILLED'
  | 'CANCELLED'

export interface ShortageMessage {
  id: number
  sender: User
  message: string
  statusSnapshot: ShortageStatus
  sentAt: string
}

export interface MaterialShortage {
  id: number
  requestNumber: string
  pressId: number
  pressNumber: string
  currentBlankingBatchId?: number
  currentBlankingBatchNumber?: string
  currentAvailableBlankQuantity: number
  requestedBlankQuantity: number
  requiredMaterialCode: string
  requiredAt: string
  priority: 'NORMAL' | 'HIGH' | 'URGENT'
  sender: User
  senderEmployeeId: string
  productionDate: string
  senderShift: ProductionShift
  status: ShortageStatus
  linkedCartId?: number
  linkedCartNumber?: string
  createdAt: string
  updatedAt: string
  messages: ShortageMessage[]
}

export interface ProductionManagerSummary {
  fromDate: string
  toDate: string
  shift?: ProductionShift
  blankingBatchesProduced: number
  blanksProduced: number
  blanksDispatched: number
  blanksAvailableAtBlanking: number
  blanksAvailableAtPresses: number
  goodTyres: number
  rejectedTyres: number
  rejectedTyreWeightGrams: number
  rejectedBlanks: number
  rejectionPercentage: number
  openShortageRequests: number
  delayedCartTransfers: number
  pressesWaitingForBlanks: number
  presses: Press[]
  cartTransfers: BlankingCart[]
  operatorProductivity: Array<{
    operator: User
    employeeId: string
    completedRuns: number
    goodTyres: number
    rejectedTyres: number
    rejectedBlanks: number
    downtimeMinutes: number
  }>
  recentRecords: MouldingProductionRecord[]
}
