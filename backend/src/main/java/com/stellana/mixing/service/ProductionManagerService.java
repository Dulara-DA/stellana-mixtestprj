package com.stellana.mixing.service;

import com.stellana.mixing.api.ApiModels.BlankingBatchView;
import com.stellana.mixing.api.ApiModels.MixingReportRow;
import com.stellana.mixing.api.ApiModels.MouldingProductionRecordView;
import com.stellana.mixing.api.ApiModels.OperatorProductivityView;
import com.stellana.mixing.api.ApiModels.ProductionReportRecords;
import com.stellana.mixing.api.ApiModels.ProductionManagerSummary;
import com.stellana.mixing.api.ApiModels.ProductionGenealogyView;
import com.stellana.mixing.domain.*;
import com.stellana.mixing.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Duration;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ProductionManagerService {
    private final BlankingBatchRepository blankingBatchRepository;
    private final BlankingCartRepository blankingCartRepository;
    private final MouldingProductionRecordRepository recordRepository;
    private final MaterialShortageRequestRepository shortageRequestRepository;
    private final MouldingService mouldingService;
    private final ShiftService shiftService;
    private final ApprovedMaterialBatchRepository approvedMaterialBatchRepository;
    private final CartReceiptRepository cartReceiptRepository;
    private final BlankReturnRepository blankReturnRepository;
    private final InventoryTransactionRepository inventoryTransactionRepository;
    private final ProductionBatchRepository productionBatchRepository;

    @Value("${app.production.cart-transfer-delay-minutes:30}")
    private long cartTransferDelayMinutes;

    @Transactional(readOnly = true)
    public ProductionManagerSummary summary(
            LocalDate fromDate,
            LocalDate toDate,
            ProductionShift shift,
            Long pressId,
            Long operatorId,
            String blankingBatchNumber,
            String mixingBatchNumber,
            String cartNumber,
            String materialCode
    ) {
        LocalDate today = shiftService.current().productionDate();
        LocalDate safeFrom = fromDate == null ? today : fromDate;
        LocalDate safeTo = toDate == null ? safeFrom : toDate;
        if (safeTo.isBefore(safeFrom)) {
            LocalDate swap = safeFrom;
            safeFrom = safeTo;
            safeTo = swap;
        }
        final LocalDate reportFrom = safeFrom;
        final LocalDate reportTo = safeTo;

        List<BlankingBatch> batches = blankingBatchRepository
                .findAllByProductionDateBetweenOrderByCreatedAtDesc(safeFrom, safeTo).stream()
                .filter(value -> shift == null || value.getShift() == shift)
                .filter(value -> matches(value.getBatchNumber(), blankingBatchNumber))
                .filter(value -> matches(value.getMixingBatchNumber(), mixingBatchNumber))
                .filter(value -> matches(value.getMaterialCode(), materialCode))
                .filter(value -> operatorId == null || value.getOperator().getId().equals(operatorId))
                .toList();
        List<Long> batchIds = batches.stream().map(BlankingBatch::getId).toList();

        List<BlankingCart> carts = blankingCartRepository.findAllByOrderByCreatedAtDesc().stream()
                .filter(value -> batchIds.contains(value.getBlankingBatch().getId()))
                .filter(value -> pressId == null || (value.getDestinationPress() != null
                        && value.getDestinationPress().getId().equals(pressId)))
                .filter(value -> matches(value.getCartNumber(), cartNumber))
                .toList();
        List<MouldingProductionRecord> records = recordRepository
                .findAllByProductionDateBetweenOrderByCreatedAtDesc(safeFrom, safeTo).stream()
                .filter(value -> value.getStatus() == MouldingRecordStatus.COMPLETED)
                .filter(value -> shift == null || value.getShift() == shift)
                .filter(value -> pressId == null || value.getPress().getId().equals(pressId))
                .filter(value -> operatorId == null || value.getOperator().getId().equals(operatorId))
                .filter(value -> matches(value.getBlankingBatch().getBatchNumber(), blankingBatchNumber))
                .filter(value -> matches(value.getBlankingBatch().getMixingBatchNumber(), mixingBatchNumber))
                .filter(value -> matches(value.getCart().getCartNumber(), cartNumber))
                .filter(value -> matches(value.getBlankingBatch().getMaterialCode(), materialCode))
                .toList();
        List<ApprovedMaterialBatch> stock = approvedMaterialBatchRepository.findAllByOrderByApprovedAtDesc().stream()
                .filter(value -> matches(value.getMixingBatchNumber(), mixingBatchNumber))
                .filter(value -> matches(value.getMaterialCode(), materialCode))
                .toList();
        List<BlankReturn> returns = blankReturnRepository.findAllByOrderByCreatedAtDesc().stream()
                .filter(value -> !value.getSendingDateTime().toLocalDate().isBefore(reportFrom)
                        && !value.getSendingDateTime().toLocalDate().isAfter(reportTo))
                .filter(value -> shift == null || value.getShift() == shift)
                .filter(value -> pressId == null || value.getPress().getId().equals(pressId))
                .filter(value -> matches(value.getBlankingBatch().getBatchNumber(), blankingBatchNumber))
                .filter(value -> matches(value.getCompoundBatchNumber(), mixingBatchNumber))
                .filter(value -> matches(value.getCart().getCartNumber(), cartNumber))
                .filter(value -> matches(value.getCompoundCode(), materialCode))
                .toList();
        List<Long> reportCartIds = carts.stream().map(BlankingCart::getId).toList();
        List<CartReceipt> receipts = cartReceiptRepository.findAllByOrderByReceivedAtDesc().stream()
                .filter(value -> reportCartIds.contains(value.getCart().getId()))
                .toList();
        BigDecimal averageTransferMinutes = receipts.isEmpty()
                ? BigDecimal.ZERO
                : receipts.stream()
                .map(value -> BigDecimal.valueOf(Duration.between(
                                value.getDispatchTime(), value.getReceivedAt()).toSeconds())
                        .divide(BigDecimal.valueOf(60), 3, RoundingMode.HALF_UP))
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .divide(BigDecimal.valueOf(receipts.size()), 2, RoundingMode.HALF_UP);

        long produced = batches.stream()
                .filter(value -> value.getProductionQuantity() != null)
                .mapToLong(BlankingBatch::getProductionQuantity)
                .sum();
        long dispatched = carts.stream()
                .filter(value -> value.getDispatchedAt() != null)
                .mapToLong(BlankingCart::getQuantity)
                .sum();
        long blankingAvailable = batches.stream()
                .mapToLong(BlankingBatch::getAvailableGoodBlankQuantity)
                .sum();
        long goodTyres = records.stream().mapToLong(MouldingProductionRecord::getGoodTyreQuantity).sum();
        long rejectedTyres = records.stream().mapToLong(MouldingProductionRecord::getRejectedTyreQuantity).sum();
        long rejectedBlanks = records.stream().mapToLong(MouldingProductionRecord::getRejectedBlankQuantity).sum();
        BigDecimal rejectedWeight = records.stream()
                .map(MouldingProductionRecord::getTotalRejectedTyreWeightGrams)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        long inspectedTyres = goodTyres + rejectedTyres;
        BigDecimal rejectionPercentage = inspectedTyres == 0
                ? BigDecimal.ZERO
                : BigDecimal.valueOf(rejectedTyres)
                .multiply(BigDecimal.valueOf(100))
                .divide(BigDecimal.valueOf(inspectedTyres), 2, RoundingMode.HALF_UP);
        LocalDateTime delayedBefore = shiftService.now().minusMinutes(cartTransferDelayMinutes);
        long delayed = carts.stream()
                .filter(value -> value.getStatus() == BlankingCartStatus.DISPATCHED)
                .filter(value -> value.getDispatchedAt() != null && value.getDispatchedAt().isBefore(delayedBefore))
                .count();
        long openShortages = shortageRequestRepository.countByStatusIn(EnumSet.of(
                ShortageStatus.OPEN, ShortageStatus.ACKNOWLEDGED, ShortageStatus.PREPARING,
                ShortageStatus.DISPATCHED));
        var presses = mouldingService.listPresses().stream()
                .filter(value -> pressId == null || value.id().equals(pressId))
                .toList();
        long pressInventory = presses.stream().mapToLong(value -> value.availableBlankQuantity()).sum();
        long waitingPresses = presses.stream()
                .filter(value -> value.status() == PressStatus.WAITING_FOR_BLANKS)
                .count();
        List<MouldingProductionRecordView> recent = records.stream()
                .limit(100)
                .map(com.stellana.mixing.api.ApiMapper::mouldingRecord)
                .toList();
        var transferViews = carts.stream()
                .limit(100)
                .map(com.stellana.mixing.api.ApiMapper::blankingCart)
                .toList();
        List<OperatorProductivityView> productivity = records.stream()
                .map(MouldingProductionRecord::getOperator)
                .distinct()
                .map(operator -> {
                    List<MouldingProductionRecord> operatorRecords = records.stream()
                            .filter(record -> record.getOperator().getId().equals(operator.getId()))
                            .toList();
                    return new OperatorProductivityView(
                            com.stellana.mixing.api.ApiMapper.user(operator),
                            operator.getEmployeeId(),
                            operatorRecords.size(),
                            operatorRecords.stream().mapToLong(MouldingProductionRecord::getGoodTyreQuantity).sum(),
                            operatorRecords.stream().mapToLong(MouldingProductionRecord::getRejectedTyreQuantity).sum(),
                            operatorRecords.stream().mapToLong(MouldingProductionRecord::getRejectedBlankQuantity).sum(),
                            operatorRecords.stream().mapToLong(MouldingProductionRecord::getDowntimeMinutes).sum());
                })
                .toList();

        return new ProductionManagerSummary(
                safeFrom,
                safeTo,
                shift,
                stock.stream().map(value -> value.getPlannedQuantityKg() == null
                                ? value.getApprovedQuantityKg() : value.getPlannedQuantityKg())
                        .reduce(BigDecimal.ZERO, BigDecimal::add),
                stock.stream().map(value -> value.getReceivedQuantityKg() == null
                                ? value.getApprovedQuantityKg() : value.getReceivedQuantityKg())
                        .reduce(BigDecimal.ZERO, BigDecimal::add),
                stock.stream().map(value -> value.getConsumedQuantityKg() == null
                                ? BigDecimal.ZERO : value.getConsumedQuantityKg())
                        .reduce(BigDecimal.ZERO, BigDecimal::add),
                stock.stream().map(ApprovedMaterialBatch::getAvailableQuantityKg)
                        .reduce(BigDecimal.ZERO, BigDecimal::add),
                batches.stream().map(value -> value.getExpectedBlankQuantity() == null
                                ? BigDecimal.valueOf(value.getPlannedProductionQuantity())
                                : value.getExpectedBlankQuantity())
                        .reduce(BigDecimal.ZERO, BigDecimal::add),
                batches.stream().mapToLong(value -> value.getActualGoodBlankQuantity() == null
                                ? Math.max(0, (value.getProductionQuantity() == null ? 0 : value.getProductionQuantity())
                                        - value.getRejectedQuantity())
                                : value.getActualGoodBlankQuantity())
                        .sum(),
                batches.stream().mapToLong(value -> value.getProductionVariance() == null
                                ? 0 : value.getProductionVariance()).sum(),
                batches.stream().mapToLong(BlankingBatch::getRejectedQuantity).sum(),
                batches.stream().map(value -> value.getRejectedMaterialWeightKg() == null
                                ? BigDecimal.ZERO : value.getRejectedMaterialWeightKg())
                        .reduce(BigDecimal.ZERO, BigDecimal::add),
                carts.stream().filter(value -> EnumSet.of(BlankingCartStatus.PREPARED,
                                BlankingCartStatus.READY_FOR_DISPATCH).contains(value.getStatus())).count(),
                carts.stream().filter(value -> value.getStatus() == BlankingCartStatus.HELD).count(),
                carts.stream().filter(value -> value.getDispatchedAt() != null).count(),
                receipts.size(),
                returns.stream().filter(value -> value.getReceivedQuantity() != null)
                        .map(value -> value.getCart().getId()).distinct().count(),
                returns.stream().filter(value -> value.getReceivedQuantity() != null)
                        .mapToLong(BlankReturn::getReceivedQuantity).sum(),
                averageTransferMinutes,
                returns.stream().map(value -> value.getReceivedWeightKg() == null
                                ? BigDecimal.ZERO : value.getReceivedWeightKg())
                        .reduce(BigDecimal.ZERO, BigDecimal::add),
                returns.stream().filter(value -> (value.getQuantityVariance() != null
                                && value.getQuantityVariance() != 0)
                                || (value.getWeightVarianceKg() != null
                                && value.getWeightVarianceKg().abs().compareTo(new BigDecimal("0.001")) > 0))
                        .count(),
                batches.stream().filter(BlankingBatch::isUnbalanced).count(),
                batches.stream().filter(value -> value.getProductionQuantity() != null).count(),
                produced,
                dispatched,
                blankingAvailable,
                pressInventory,
                goodTyres,
                rejectedTyres,
                rejectedWeight,
                rejectedBlanks,
                rejectionPercentage,
                openShortages,
                delayed,
                waitingPresses,
                presses,
                transferViews,
                productivity,
                recent);
    }

    @Transactional(readOnly = true)
    public ProductionReportRecords records(
            LocalDate fromDate,
            LocalDate toDate,
            ProductionShift shift,
            Long pressId,
            Long operatorId,
            String blankingBatchNumber,
            String mixingBatchNumber,
            String cartNumber,
            String materialCode
    ) {
        LocalDate today = shiftService.current().productionDate();
        LocalDate safeFrom = fromDate == null ? today : fromDate;
        LocalDate safeTo = toDate == null ? safeFrom : toDate;
        if (safeTo.isBefore(safeFrom)) {
            LocalDate swap = safeFrom;
            safeFrom = safeTo;
            safeTo = swap;
        }
        final LocalDate reportFrom = safeFrom;
        final LocalDate reportTo = safeTo;

        List<MixingReportRow> mixingRows = productionBatchRepository.findAllByOrderByCreatedAtDesc().stream()
                .map(batch -> {
                    LocalDateTime activityTime = batch.getStage1StartedAt() != null
                            ? batch.getStage1StartedAt()
                            : batch.getCreatedAt();
                    ShiftService.ShiftContext context = shiftService.calculate(activityTime);
                    return new MixingRowContext(batch, context, activityTime);
                })
                .filter(value -> !value.context().productionDate().isBefore(reportFrom)
                        && !value.context().productionDate().isAfter(reportTo))
                .filter(value -> shift == null || value.context().shift() == shift)
                .filter(value -> operatorId == null
                        || value.batch().getAssignedOfficer().getId().equals(operatorId))
                .filter(value -> matches(value.batch().getBatchNumber(), mixingBatchNumber))
                .filter(value -> matches(
                        value.batch().getRecipeRevision().getRecipe().getRecipeCode(), materialCode))
                .sorted(Comparator.comparing(MixingRowContext::activityTime).reversed())
                .map(value -> {
                    ProductionBatch batch = value.batch();
                    UserAccount officer = batch.getAssignedOfficer();
                    return new MixingReportRow(
                            batch.getId(),
                            batch.getBatchNumber(),
                            batch.getRecipeRevision().getRecipe().getRecipeCode(),
                            batch.getRecipeRevision().getRevisionNumber(),
                            batch.getPlannedQuantityKg(),
                            batch.getActualOutputQuantityKg(),
                            batch.getMachine(),
                            com.stellana.mixing.api.ApiMapper.user(officer),
                            StringUtils.hasText(officer.getEmployeeId())
                                    ? officer.getEmployeeId() : "USER-" + officer.getId(),
                            value.context().productionDate(),
                            value.context().shift(),
                            batch.getStage1StartedAt(),
                            batch.getStage1CompletedAt(),
                            batch.getStage2StartedAt(),
                            batch.getStage2CompletedAt(),
                            batch.getLaboratoryStatus(),
                            batch.getReleaseStatus(),
                            batch.getStatus());
                })
                .toList();

        List<BlankingCart> allCarts = blankingCartRepository.findAllByOrderByCreatedAtDesc();
        List<BlankingBatchView> blankingRows = blankingBatchRepository
                .findAllByProductionDateBetweenOrderByCreatedAtDesc(safeFrom, safeTo).stream()
                .filter(value -> shift == null || value.getShift() == shift)
                .filter(value -> operatorId == null || value.getOperator().getId().equals(operatorId))
                .filter(value -> matches(value.getBatchNumber(), blankingBatchNumber))
                .filter(value -> matches(value.getMixingBatchNumber(), mixingBatchNumber))
                .filter(value -> matches(value.getMaterialCode(), materialCode))
                .filter(value -> (pressId == null && !StringUtils.hasText(cartNumber))
                        || allCarts.stream().anyMatch(cart ->
                        cart.getBlankingBatch().getId().equals(value.getId())
                                && (pressId == null || (cart.getDestinationPress() != null
                                && cart.getDestinationPress().getId().equals(pressId)))
                                && matches(cart.getCartNumber(), cartNumber)))
                .map(com.stellana.mixing.api.ApiMapper::blankingBatch)
                .toList();

        List<MouldingProductionRecordView> mouldingRows = recordRepository
                .findAllByProductionDateBetweenOrderByCreatedAtDesc(safeFrom, safeTo).stream()
                .filter(value -> shift == null || value.getShift() == shift)
                .filter(value -> pressId == null || value.getPress().getId().equals(pressId))
                .filter(value -> operatorId == null || value.getOperator().getId().equals(operatorId))
                .filter(value -> matches(value.getBlankingBatch().getBatchNumber(), blankingBatchNumber))
                .filter(value -> matches(value.getBlankingBatch().getMixingBatchNumber(), mixingBatchNumber))
                .filter(value -> matches(value.getCart().getCartNumber(), cartNumber))
                .filter(value -> matches(value.getBlankingBatch().getMaterialCode(), materialCode))
                .map(com.stellana.mixing.api.ApiMapper::mouldingRecord)
                .toList();

        return new ProductionReportRecords(mixingRows, blankingRows, mouldingRows);
    }

    @Transactional(readOnly = true)
    public ProductionGenealogyView genealogy(String mixingBatchNumber) {
        ApprovedMaterialBatch stock = approvedMaterialBatchRepository
                .findByMixingBatchNumberIgnoreCase(mixingBatchNumber)
                .orElseThrow(() -> new com.stellana.mixing.exception.NotFoundException(
                        "Compound stock was not found for Mixing batch " + mixingBatchNumber + "."));
        List<BlankingBatch> batches = blankingBatchRepository.findAllByOrderByCreatedAtDesc().stream()
                .filter(value -> value.getMixingBatchNumber().equalsIgnoreCase(mixingBatchNumber))
                .toList();
        List<Long> batchIds = batches.stream().map(BlankingBatch::getId).toList();
        List<BlankingCart> carts = blankingCartRepository.findAllByOrderByCreatedAtDesc().stream()
                .filter(value -> batchIds.contains(value.getBlankingBatch().getId()))
                .toList();
        List<Long> cartIds = carts.stream().map(BlankingCart::getId).toList();
        List<CartReceipt> receipts = cartReceiptRepository.findAllByOrderByReceivedAtDesc().stream()
                .filter(value -> cartIds.contains(value.getCart().getId()))
                .toList();
        List<MouldingProductionRecord> records = recordRepository.findAllByOrderByCreatedAtDesc().stream()
                .filter(value -> cartIds.contains(value.getCart().getId()))
                .toList();
        List<BlankReturn> returns = blankReturnRepository.findAllByOrderByCreatedAtDesc().stream()
                .filter(value -> cartIds.contains(value.getCart().getId()))
                .toList();
        List<Long> returnIds = returns.stream().map(BlankReturn::getId).toList();
        List<Long> recordIds = records.stream().map(MouldingProductionRecord::getId).toList();
        List<InventoryTransaction> transactions = inventoryTransactionRepository
                .findAllByOrderByTransactionTimeAsc().stream()
                .filter(value -> related(value, stock.getId(), batchIds, cartIds, recordIds, returnIds))
                .toList();
        return new ProductionGenealogyView(
                com.stellana.mixing.api.ApiMapper.approvedMaterialBatch(stock),
                batches.stream().map(com.stellana.mixing.api.ApiMapper::blankingBatch).toList(),
                carts.stream().map(com.stellana.mixing.api.ApiMapper::blankingCart).toList(),
                receipts.stream().map(com.stellana.mixing.api.ApiMapper::cartReceipt).toList(),
                records.stream().map(com.stellana.mixing.api.ApiMapper::mouldingRecord).toList(),
                returns.stream().map(com.stellana.mixing.api.ApiMapper::blankReturn).toList(),
                transactions.stream().map(com.stellana.mixing.api.ApiMapper::inventoryTransaction).toList());
    }

    private boolean related(
            InventoryTransaction value,
            Long stockId,
            List<Long> batchIds,
            List<Long> cartIds,
            List<Long> recordIds,
            List<Long> returnIds
    ) {
        return recordMatches(value.getSourceRecordType(), value.getSourceRecordId(),
                stockId, batchIds, cartIds, recordIds, returnIds)
                || recordMatches(value.getDestinationRecordType(), value.getDestinationRecordId(),
                stockId, batchIds, cartIds, recordIds, returnIds);
    }

    private boolean recordMatches(
            String type,
            Long id,
            Long stockId,
            List<Long> batchIds,
            List<Long> cartIds,
            List<Long> recordIds,
            List<Long> returnIds
    ) {
        if (type == null || id == null) return false;
        return switch (type) {
            case "ApprovedMaterialBatch" -> id.equals(stockId);
            case "BlankingBatch" -> batchIds.contains(id);
            case "BlankingCart" -> cartIds.contains(id);
            case "MouldingProductionRecord" -> recordIds.contains(id);
            case "BlankReturn" -> returnIds.contains(id);
            default -> false;
        };
    }

    private boolean matches(String value, String filter) {
        return !StringUtils.hasText(filter)
                || (value != null && value.toLowerCase().contains(filter.trim().toLowerCase()));
    }

    private record MixingRowContext(
            ProductionBatch batch,
            ShiftService.ShiftContext context,
            LocalDateTime activityTime
    ) {}
}
