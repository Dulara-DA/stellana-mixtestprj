package com.stellana.mixing.service;

import com.stellana.mixing.api.ApiModels.MouldingProductionRecordView;
import com.stellana.mixing.api.ApiModels.OperatorProductivityView;
import com.stellana.mixing.api.ApiModels.ProductionManagerSummary;
import com.stellana.mixing.domain.*;
import com.stellana.mixing.repository.BlankingBatchRepository;
import com.stellana.mixing.repository.BlankingCartRepository;
import com.stellana.mixing.repository.MaterialShortageRequestRepository;
import com.stellana.mixing.repository.MouldingProductionRecordRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
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
                .filter(value -> pressId == null || value.getDestinationPress().getId().equals(pressId))
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

        long produced = batches.stream()
                .filter(value -> value.getProductionQuantity() != null)
                .mapToLong(BlankingBatch::getProductionQuantity)
                .sum();
        long dispatched = carts.stream()
                .filter(value -> value.getStatus() != BlankingCartStatus.PREPARED)
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

    private boolean matches(String value, String filter) {
        return !StringUtils.hasText(filter)
                || (value != null && value.toLowerCase().contains(filter.trim().toLowerCase()));
    }
}
