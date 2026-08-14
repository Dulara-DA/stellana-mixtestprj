package com.stellana.mixing.service;

import com.stellana.mixing.api.ApiModels.ProductionManagerSummary;
import com.stellana.mixing.domain.BlankingBatch;
import com.stellana.mixing.domain.BlankingCart;
import com.stellana.mixing.domain.BlankReturn;
import com.stellana.mixing.domain.LabSample;
import com.stellana.mixing.domain.MixingStage;
import com.stellana.mixing.domain.MouldingProductionRecord;
import com.stellana.mixing.domain.ProductionBatch;
import com.stellana.mixing.domain.ProductionReportSection;
import com.stellana.mixing.domain.ProductionShift;
import com.stellana.mixing.domain.UserAccount;
import com.stellana.mixing.repository.BlankingBatchRepository;
import com.stellana.mixing.repository.BlankingCartRepository;
import com.stellana.mixing.repository.BlankReturnRepository;
import com.stellana.mixing.repository.LabSampleRepository;
import com.stellana.mixing.repository.MixingStageRepository;
import com.stellana.mixing.repository.MouldingProductionRecordRepository;
import com.stellana.mixing.repository.ProductionBatchRepository;
import lombok.RequiredArgsConstructor;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
@RequiredArgsConstructor
public class CombinedProductionPdfService {
    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private final ProductionManagerService productionManagerService;
    private final ProductionBatchRepository productionBatchRepository;
    private final MixingStageRepository mixingStageRepository;
    private final LabSampleRepository labSampleRepository;
    private final BlankingBatchRepository blankingBatchRepository;
    private final BlankingCartRepository blankingCartRepository;
    private final BlankReturnRepository blankReturnRepository;
    private final MouldingProductionRecordRepository mouldingRecordRepository;
    private final CurrentUserService currentUserService;
    private final ShiftService shiftService;

    @Transactional(readOnly = true)
    public GeneratedPdf generate(
            ProductionReportSection requestedSection,
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
        ProductionReportSection section = requestedSection == null
                ? ProductionReportSection.COMBINED : requestedSection;
        DateRange range = normalizeRange(fromDate, toDate);
        UserAccount generatedBy = currentUserService.requireCurrentUser();
        ProductionManagerSummary summary = productionManagerService.summary(
                range.from(), range.to(), shift, pressId, operatorId,
                blankingBatchNumber, mixingBatchNumber, cartNumber, materialCode);

        List<MixingEntry> mixingEntries = mixingEntries(
                range, shift, operatorId, mixingBatchNumber, materialCode);
        List<BlankingBatch> blankingBatches = blankingBatchRepository
                .findAllByProductionDateBetweenOrderByCreatedAtDesc(range.from(), range.to()).stream()
                .filter(value -> shift == null || value.getShift() == shift)
                .filter(value -> operatorId == null || value.getOperator().getId().equals(operatorId))
                .filter(value -> matches(value.getBatchNumber(), blankingBatchNumber))
                .filter(value -> matches(value.getMixingBatchNumber(), mixingBatchNumber))
                .filter(value -> matches(value.getMaterialCode(), materialCode))
                .toList();
        List<Long> blankingIds = blankingBatches.stream().map(BlankingBatch::getId).toList();
        List<BlankingCart> carts = blankingCartRepository.findAllByOrderByCreatedAtDesc().stream()
                .filter(value -> blankingIds.contains(value.getBlankingBatch().getId()))
                .filter(value -> pressId == null || (value.getDestinationPress() != null
                        && value.getDestinationPress().getId().equals(pressId)))
                .filter(value -> matches(value.getCartNumber(), cartNumber))
                .toList();
        List<MouldingProductionRecord> mouldingRecords = mouldingRecordRepository
                .findAllByProductionDateBetweenOrderByCreatedAtDesc(range.from(), range.to()).stream()
                .filter(value -> shift == null || value.getShift() == shift)
                .filter(value -> pressId == null || value.getPress().getId().equals(pressId))
                .filter(value -> operatorId == null || value.getOperator().getId().equals(operatorId))
                .filter(value -> matches(value.getBlankingBatch().getBatchNumber(), blankingBatchNumber))
                .filter(value -> matches(value.getBlankingBatch().getMixingBatchNumber(), mixingBatchNumber))
                .filter(value -> matches(value.getCart().getCartNumber(), cartNumber))
                .filter(value -> matches(value.getBlankingBatch().getMaterialCode(), materialCode))
                .toList();
        List<BlankReturn> returns = blankReturnRepository.findAllByOrderByCreatedAtDesc().stream()
                .filter(value -> !value.getSendingDateTime().toLocalDate().isBefore(range.from())
                        && !value.getSendingDateTime().toLocalDate().isAfter(range.to()))
                .filter(value -> shift == null || value.getShift() == shift)
                .filter(value -> pressId == null || value.getPress().getId().equals(pressId))
                .filter(value -> operatorId == null
                        || value.getSendingOperator().getId().equals(operatorId)
                        || (value.getReceivingOperator() != null
                        && value.getReceivingOperator().getId().equals(operatorId)))
                .filter(value -> matches(value.getBlankingBatch().getBatchNumber(), blankingBatchNumber))
                .filter(value -> matches(value.getCompoundBatchNumber(), mixingBatchNumber))
                .filter(value -> matches(value.getCart().getCartNumber(), cartNumber))
                .filter(value -> matches(value.getCompoundCode(), materialCode))
                .toList();

        try (PDDocument document = new PDDocument()) {
            ReportCanvas canvas = new ReportCanvas(document);
            canvas.start(
                    reportTitle(section),
                    reportScope(section),
                    range,
                    shift,
                    generatedBy,
                    filterDescription(pressId, operatorId, blankingBatchNumber,
                            mixingBatchNumber, cartNumber, materialCode));
            if (section == ProductionReportSection.COMBINED) {
                drawSummary(canvas, summary, mixingEntries);
            } else {
                drawSectionSummary(
                        canvas, section, mixingEntries, blankingBatches,
                        carts, mouldingRecords, returns);
            }
            if (section == ProductionReportSection.COMBINED
                    || section == ProductionReportSection.MIXING) {
                drawMixing(canvas, mixingEntries);
            }
            if (section == ProductionReportSection.COMBINED
                    || section == ProductionReportSection.BLANKING) {
                drawBlanking(canvas, blankingBatches);
                drawCarts(canvas, carts);
            }
            if (section == ProductionReportSection.COMBINED
                    || section == ProductionReportSection.MOULDING) {
                drawMoulding(canvas, mouldingRecords);
            }
            if (section == ProductionReportSection.COMBINED
                    || section == ProductionReportSection.BLANKING
                    || section == ProductionReportSection.MOULDING) {
                drawReturns(canvas, returns);
            }
            canvas.note(
                    "Data reliability note",
                    "Quantities are reported in explicit kg, g and piece units. Expected blanks use issued kg "
                            + "and recorded average blank grams; no process-loss allowance is invented. "
                            + "Unconfirmed targets and laboratory limits are excluded.");
            canvas.finish();

            ByteArrayOutputStream output = new ByteArrayOutputStream();
            document.save(output);
            String filename = "stellana-" + section.name().toLowerCase() + "-production-report-"
                    + range.from() + "-to-" + range.to() + ".pdf";
            return new GeneratedPdf(output.toByteArray(), filename);
        } catch (IOException exception) {
            throw new IllegalStateException("The combined production PDF could not be generated.", exception);
        }
    }

    private String reportTitle(ProductionReportSection section) {
        return section == ProductionReportSection.COMBINED
                ? "COMBINED PRODUCTION REPORT"
                : section.name() + " PRODUCTION REPORT";
    }

    private String reportScope(ProductionReportSection section) {
        return switch (section) {
            case COMBINED -> "Mixing | Blanking | Moulding";
            case MIXING -> "Mixing records";
            case BLANKING -> "Blanking production | Cart dispatch | Returns";
            case MOULDING -> "Press production | Blank returns";
        };
    }

    private List<MixingEntry> mixingEntries(
            DateRange range,
            ProductionShift shift,
            Long operatorId,
            String mixingBatchNumber,
            String materialCode
    ) {
        List<MixingEntry> entries = new ArrayList<>();
        for (ProductionBatch batch : productionBatchRepository.findAllByOrderByCreatedAtDesc()) {
            List<MixingStage> stages = mixingStageRepository.findAllByBatchIdOrderByStageNumberAsc(batch.getId());
            LocalDateTime activityTime = stages.stream()
                    .map(MixingStage::getStartTime)
                    .filter(value -> value != null)
                    .min(Comparator.naturalOrder())
                    .orElse(batch.getCreatedAt());
            ShiftService.ShiftContext context = shiftService.calculate(activityTime);
            if (context.productionDate().isBefore(range.from())
                    || context.productionDate().isAfter(range.to())
                    || (shift != null && context.shift() != shift)
                    || (operatorId != null && !batch.getAssignedOfficer().getId().equals(operatorId))
                    || !matches(batch.getBatchNumber(), mixingBatchNumber)
                    || !matches(batch.getRecipeRevision().getRecipe().getRecipeCode(), materialCode)) {
                continue;
            }
            LabSample lab = labSampleRepository.findFirstByBatchIdOrderBySentToLabAtDesc(batch.getId())
                    .orElse(null);
            entries.add(new MixingEntry(batch, stages, lab, context.productionDate(), context.shift()));
        }
        return entries;
    }

    private void drawSummary(
            ReportCanvas canvas,
            ProductionManagerSummary summary,
            List<MixingEntry> mixingEntries
    ) throws IOException {
        BigDecimal plannedMixingKg = mixingEntries.stream()
                .map(value -> value.batch().getPlannedQuantityKg())
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal actualMixingKg = mixingEntries.stream()
                .map(value -> value.batch().getActualOutputQuantityKg())
                .filter(value -> value != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        canvas.section("PRODUCTION SUMMARY",
                "Persisted records included in this report period.");
        canvas.metrics(List.of(
                new Metric("Mixing batches", String.valueOf(mixingEntries.size())),
                new Metric("Planned mix", number(plannedMixingKg) + " kg"),
                new Metric("Actual mix", number(actualMixingKg) + " kg"),
                new Metric("Blanking batches", String.valueOf(summary.blankingBatchesProduced())),
                new Metric("Expected / actual blanks",
                        number(summary.expectedBlankQuantity()) + " / " + summary.actualGoodBlankQuantity()),
                new Metric("Compound used", number(summary.compoundUsedKg()) + " kg"),
                new Metric("Compound available", number(summary.compoundAvailableKg()) + " kg"),
                new Metric("Good tyres", String.valueOf(summary.goodTyres())),
                new Metric("Rejected items",
                        String.valueOf(summary.rejectedTyres() + summary.rejectedBlanks()))
        ));
        canvas.text("Moulding rejection rate: " + number(summary.rejectionPercentage())
                + "% | Open shortages: " + summary.openShortageRequests()
                + " | Delayed cart transfers: " + summary.delayedCartTransfers()
                + " | Avg transfer: " + number(summary.averageCartTransferMinutes()) + " min"
                + " | Returned carts/pieces: " + summary.cartsReturned()
                + "/" + summary.returnedBlankQuantity()
                + " | Return variances: " + summary.returnVariances()
                + " | Unbalanced records: " + summary.unbalancedRecords());
    }

    private void drawSectionSummary(
            ReportCanvas canvas,
            ProductionReportSection section,
            List<MixingEntry> mixingEntries,
            List<BlankingBatch> blankingBatches,
            List<BlankingCart> carts,
            List<MouldingProductionRecord> mouldingRecords,
            List<BlankReturn> returns
    ) throws IOException {
        canvas.section("REPORT SUMMARY", "Persisted records included in the selected section.");
        switch (section) {
            case MIXING -> canvas.metrics(List.of(
                    new Metric("Mixing batches", String.valueOf(mixingEntries.size())),
                    new Metric("Planned mix", number(mixingEntries.stream()
                            .map(value -> value.batch().getPlannedQuantityKg())
                            .reduce(BigDecimal.ZERO, BigDecimal::add)) + " kg"),
                    new Metric("Actual mix", number(mixingEntries.stream()
                            .map(value -> value.batch().getActualOutputQuantityKg())
                            .filter(value -> value != null)
                            .reduce(BigDecimal.ZERO, BigDecimal::add)) + " kg"),
                    new Metric("Lab passed", String.valueOf(mixingEntries.stream()
                            .filter(value -> value.lab() != null
                                    && value.lab().getDecision() == com.stellana.mixing.domain.LabDecision.PASS)
                            .count()))));
            case BLANKING -> canvas.metrics(List.of(
                    new Metric("Blanking batches", String.valueOf(blankingBatches.size())),
                    new Metric("Blank output", String.valueOf(blankingBatches.stream()
                            .map(BlankingBatch::getProductionQuantity)
                            .filter(value -> value != null)
                            .mapToLong(Integer::longValue).sum())),
                    new Metric("Rejected blanks", String.valueOf(blankingBatches.stream()
                            .mapToLong(BlankingBatch::getRejectedQuantity).sum())),
                    new Metric("Cart transfers", String.valueOf(carts.size())),
                    new Metric("Blank returns", String.valueOf(returns.size()))));
            case MOULDING -> canvas.metrics(List.of(
                    new Metric("Press entries", String.valueOf(mouldingRecords.size())),
                    new Metric("Good tyres", String.valueOf(mouldingRecords.stream()
                            .mapToLong(MouldingProductionRecord::getGoodTyreQuantity).sum())),
                    new Metric("Rejected tyres", String.valueOf(mouldingRecords.stream()
                            .mapToLong(MouldingProductionRecord::getRejectedTyreQuantity).sum())),
                    new Metric("Rejected blanks", String.valueOf(mouldingRecords.stream()
                            .mapToLong(MouldingProductionRecord::getRejectedBlankQuantity).sum())),
                    new Metric("Downtime", mouldingRecords.stream()
                            .mapToLong(MouldingProductionRecord::getDowntimeMinutes).sum() + " min"),
                    new Metric("Blank returns", String.valueOf(returns.size()))));
            case COMBINED -> throw new IllegalArgumentException("Combined uses the cross-section summary.");
        }
        canvas.text("Detailed records are listed in newest-first section tables on the following pages.");
    }

    private void drawMixing(ReportCanvas canvas, List<MixingEntry> entries) throws IOException {
        List<Column> columns = List.of(
                new Column("Batch", 69),
                new Column("Recipe", 65),
                new Column("Qty kg", 53),
                new Column("Machine", 55),
                new Column("Officer", 76),
                new Column("Stage 1", 112),
                new Column("Stage 2", 112),
                new Column("Lab / release", 90),
                new Column("Status", 70)
        );
        List<List<String>> rows = entries.stream().map(entry -> {
            ProductionBatch batch = entry.batch();
            MixingStage stage1 = stage(entry.stages(), 1);
            MixingStage stage2 = stage(entry.stages(), 2);
            String lab = entry.lab() == null
                    ? enumText(batch.getLaboratoryStatus())
                    : enumText(entry.lab().getDecision()) + "\nTest: " + dateTime(entry.lab().getTestDateTime());
            return List.of(
                    batch.getBatchNumber() + "\n" + entry.productionDate() + " " + enumText(entry.shift()),
                    batch.getRecipeRevision().getRecipe().getRecipeCode()
                            + " Rev " + batch.getRecipeRevision().getRevisionNumber(),
                    "Plan " + number(batch.getPlannedQuantityKg())
                            + "\nActual " + number(batch.getActualOutputQuantityKg()),
                    batch.getMachine(),
                    batch.getAssignedOfficer().getFullName()
                            + "\n" + employeeId(batch.getAssignedOfficer()),
                    stageDetails(stage1),
                    stageDetails(stage2),
                    lab + "\n" + enumText(batch.getReleaseStatus()),
                    enumText(batch.getStatus())
            );
        }).toList();
        canvas.table(
                "MIXING RECORDS",
                "Batch, exact recipe revision, processing stages, laboratory decision and release state.",
                columns,
                rows);
    }

    private void drawBlanking(ReportCanvas canvas, List<BlankingBatch> batches) throws IOException {
        List<Column> columns = List.of(
                new Column("Blanking batch", 85),
                new Column("Mixing trace", 78),
                new Column("Material / kg", 76),
                new Column("Plan / output", 75),
                new Column("Rejected / available", 88),
                new Column("Shift / operator", 100),
                new Column("IN / OUT", 115),
                new Column("Status", 83)
        );
        List<List<String>> rows = batches.stream().map(batch -> List.of(
                batch.getBatchNumber(),
                batch.getMixingBatchNumber(),
                batch.getMaterialCode() + "\n" + number(batch.getMaterialConsumedKg()) + " kg",
                "Plan " + batch.getPlannedProductionQuantity()
                        + "\nOutput " + value(batch.getProductionQuantity()),
                "Rejected " + batch.getRejectedQuantity()
                        + "\nAvailable " + batch.getAvailableGoodBlankQuantity(),
                batch.getProductionDate() + " " + enumText(batch.getShift())
                        + "\n" + batch.getOperator().getFullName()
                        + " (" + batch.getOperatorEmployeeId() + ")",
                "IN " + dateTime(batch.getStartTime())
                        + "\nOUT " + dateTime(batch.getEndTime()),
                enumText(batch.getStatus())
        )).toList();
        canvas.table(
                "BLANKING RECORDS",
                "Material consumption and blank production remain separate units.",
                columns,
                rows);
    }

    private void drawCarts(ReportCanvas canvas, List<BlankingCart> carts) throws IOException {
        List<Column> columns = List.of(
                new Column("Cart", 95),
                new Column("Blanking / mixing", 125),
                new Column("Material", 75),
                new Column("Quantity", 65),
                new Column("Remaining", 65),
                new Column("Destination", 95),
                new Column("Dispatch", 120),
                new Column("Status", 80)
        );
        List<List<String>> rows = carts.stream().map(cart -> List.of(
                cart.getCartNumber(),
                cart.getBlankingBatch().getBatchNumber()
                        + "\n" + cart.getBlankingBatch().getMixingBatchNumber(),
                cart.getMaterialCode(),
                String.valueOf(cart.getQuantity()),
                String.valueOf(cart.getRemainingQuantity()),
                cart.getDestinationPress() == null ? "Pending Moulding receipt"
                        : cart.getDestinationPress().getPressNumber(),
                dateTime(cart.getDispatchedAt())
                        + "\n" + (cart.getDispatchedBy() == null
                        ? "Not dispatched"
                        : cart.getDispatchedBy().getFullName()),
                enumText(cart.getStatus())
        )).toList();
        canvas.table(
                "BLANKING TO MOULDING CARTS",
                "Cart quantities, destinations and current transfer states.",
                columns,
                rows);
    }

    private void drawMoulding(
            ReportCanvas canvas,
            List<MouldingProductionRecord> records
    ) throws IOException {
        List<Column> columns = List.of(
                new Column("Press / shift", 85),
                new Column("Cart / blanking", 100),
                new Column("Operator", 85),
                new Column("IN / OUT", 110),
                new Column("Received / remaining", 82),
                new Column("Good", 55),
                new Column("Rejected", 78),
                new Column("Downtime", 72),
                new Column("Status", 70)
        );
        List<List<String>> rows = records.stream().map(record -> List.of(
                record.getPress().getPressNumber()
                        + "\n" + record.getProductionDate() + " " + enumText(record.getShift()),
                record.getCart().getCartNumber()
                        + "\n" + record.getBlankingBatch().getBatchNumber(),
                record.getOperator().getFullName()
                        + "\n" + record.getOperatorEmployeeId(),
                "IN " + dateTime(record.getStartTime())
                        + "\nOUT " + dateTime(record.getEndTime()),
                record.getQuantityReceived() + " received"
                        + "\n" + record.getRemainingBlankQuantity() + " remaining",
                String.valueOf(record.getGoodTyreQuantity()),
                record.getRejectedTyreQuantity() + " tyres"
                        + "\n" + record.getRejectedBlankQuantity() + " blanks"
                        + "\n" + number(record.getTotalRejectedTyreWeightGrams()) + " g",
                record.getDowntimeMinutes() + " min"
                        + (StringUtils.hasText(record.getDowntimeReason())
                        ? "\n" + record.getDowntimeReason()
                        : ""),
                enumText(record.getStatus())
        )).toList();
        canvas.table(
                "MOULDING RECORDS",
                "Persisted production output, rejections, remaining inventory and downtime.",
                columns,
                rows);
    }

    private void drawReturns(ReportCanvas canvas, List<BlankReturn> returns) throws IOException {
        List<Column> columns = List.of(
                new Column("Return", 90),
                new Column("Compound trace", 105),
                new Column("Press / cart", 95),
                new Column("Sent pieces / kg", 80),
                new Column("Sending operator / time", 120),
                new Column("Received / variance", 105),
                new Column("Receiving operator / time", 120),
                new Column("Status", 85)
        );
        List<List<String>> rows = returns.stream().map(value -> List.of(
                value.getReturnNumber(),
                value.getCompoundCode() + " / " + value.getCompoundBatchNumber()
                        + "\n" + value.getBlankingBatch().getBatchNumber(),
                value.getPress().getPressNumber() + "\n" + value.getCart().getCartNumber(),
                value.getPreparedQuantity() + " pieces\n"
                        + number(value.getMeasuredReturnWeightKg()) + " kg",
                value.getSendingOperator().getFullName()
                        + "\n" + dateTime(value.getSendingDateTime()),
                value.getReceivedQuantity() == null
                        ? "Awaiting"
                        : value.getReceivedQuantity() + " pieces / "
                        + number(value.getReceivedWeightKg()) + " kg"
                        + "\nVariance " + value.getQuantityVariance() + " / "
                        + number(value.getWeightVarianceKg()) + " kg",
                value.getReceivingOperator() == null
                        ? "-"
                        : value.getReceivingOperator().getFullName()
                        + "\n" + dateTime(value.getReceivingDateTime()),
                enumText(value.getStatus())
        )).toList();
        canvas.table(
                "BLANK RETURNS",
                "Unused pieces are reserved at Moulding and restored to Blanking only after confirmed receipt.",
                columns,
                rows);
    }

    private DateRange normalizeRange(LocalDate fromDate, LocalDate toDate) {
        LocalDate today = shiftService.current().productionDate();
        LocalDate from = fromDate == null ? today : fromDate;
        LocalDate to = toDate == null ? from : toDate;
        return to.isBefore(from) ? new DateRange(to, from) : new DateRange(from, to);
    }

    private String filterDescription(
            Long pressId,
            Long operatorId,
            String blankingBatch,
            String mixingBatch,
            String cart,
            String material
    ) {
        List<String> filters = new ArrayList<>();
        if (pressId != null) filters.add("Press ID " + pressId);
        if (operatorId != null) filters.add("Operator ID " + operatorId);
        if (StringUtils.hasText(blankingBatch)) filters.add("Blanking " + blankingBatch.trim());
        if (StringUtils.hasText(mixingBatch)) filters.add("Mixing " + mixingBatch.trim());
        if (StringUtils.hasText(cart)) filters.add("Cart " + cart.trim());
        if (StringUtils.hasText(material)) filters.add("Material " + material.trim());
        return filters.isEmpty() ? "No additional filters" : String.join(" | ", filters);
    }

    private boolean matches(String value, String filter) {
        return !StringUtils.hasText(filter)
                || (value != null && value.toLowerCase().contains(filter.trim().toLowerCase()));
    }

    private static MixingStage stage(List<MixingStage> stages, int number) {
        return stages.stream().filter(value -> value.getStageNumber() == number).findFirst().orElse(null);
    }

    private static String stageDetails(MixingStage stage) {
        if (stage == null) return "Not recorded";
        String process = "IN " + dateTime(stage.getStartTime())
                + "\nOUT " + dateTime(stage.getEndTime());
        if (stage.getTemperatureCelsius() != null) {
            process += "\nTemp " + number(stage.getTemperatureCelsius()) + " C";
        }
        if (stage.getMixingTimeSeconds() != null) {
            BigDecimal minutes = BigDecimal.valueOf(stage.getMixingTimeSeconds())
                    .divide(BigDecimal.valueOf(60), 2, RoundingMode.HALF_UP);
            process += " / " + number(minutes) + " min";
        }
        return process + "\n" + enumText(stage.getCompletionStatus());
    }

    private static String employeeId(UserAccount user) {
        return StringUtils.hasText(user.getEmployeeId()) ? user.getEmployeeId() : "USER-" + user.getId();
    }

    private static String dateTime(LocalDateTime value) {
        return value == null ? "-" : value.format(DATE_TIME);
    }

    private static String value(Integer value) {
        return value == null ? "-" : String.valueOf(value);
    }

    private static String number(BigDecimal value) {
        return value == null ? "-" : value.stripTrailingZeros().toPlainString();
    }

    private static String enumText(Enum<?> value) {
        return value == null ? "-" : value.name().replace('_', ' ');
    }

    public record GeneratedPdf(byte[] content, String filename) {}

    private record DateRange(LocalDate from, LocalDate to) {}

    private record MixingEntry(
            ProductionBatch batch,
            List<MixingStage> stages,
            LabSample lab,
            LocalDate productionDate,
            ProductionShift shift
    ) {}

    private record Metric(String label, String value) {}

    private record Column(String title, float width) {}

    private static final class ReportCanvas {
        private static final PDRectangle PAGE_SIZE =
                new PDRectangle(PDRectangle.A4.getHeight(), PDRectangle.A4.getWidth());
        private static final float MARGIN = 26;
        private static final float FOOTER_HEIGHT = 22;
        private static final float CONTENT_WIDTH = PAGE_SIZE.getWidth() - (MARGIN * 2);
        private static final PDFont REGULAR =
                new PDType1Font(Standard14Fonts.FontName.HELVETICA);
        private static final PDFont BOLD =
                new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);

        private final PDDocument document;
        private PDPage page;
        private PDPageContentStream stream;
        private float y;
        private String reportTitle = "PRODUCTION REPORT";
        private String reportScope = "Persisted production records";

        private ReportCanvas(PDDocument document) {
            this.document = document;
        }

        private void start(
                String title,
                String scope,
                DateRange range,
                ProductionShift shift,
                UserAccount generatedBy,
                String filters
        ) throws IOException {
            reportTitle = title;
            reportScope = scope;
            newPage();
            setFill(18, 38, 63);
            stream.addRect(MARGIN, y - 52, CONTENT_WIDTH, 52);
            stream.fill();
            setTextColor(255, 255, 255);
            text(BOLD, 18, MARGIN + 16, y - 22, "STELLANA");
            text(REGULAR, 8, MARGIN + 16, y - 37, "REAL-TIME PRODUCTION TRACKING SYSTEM");
            text(BOLD, 15, MARGIN + 155, y - 23, reportTitle);
            text(REGULAR, 8, MARGIN + 230, y - 38,
                    reportScope);
            y -= 66;
            setTextColor(20, 35, 55);
            text(BOLD, 9, MARGIN, y, "REPORT PERIOD");
            text(REGULAR, 9, MARGIN + 85, y,
                    range.from() + " to " + range.to()
                            + (shift == null ? " | All shifts" : " | " + enumText(shift)));
            y -= 15;
            text(BOLD, 9, MARGIN, y, "GENERATED");
            text(REGULAR, 9, MARGIN + 85, y,
                    dateTime(LocalDateTime.now()) + " by " + generatedBy.getFullName()
                            + " (" + employeeId(generatedBy) + ")");
            y -= 15;
            text(BOLD, 9, MARGIN, y, "FILTERS");
            text(REGULAR, 9, MARGIN + 85, y, filters);
            y -= 24;
        }

        private void section(String title, String subtitle) throws IOException {
            ensure(38);
            setFill(230, 239, 249);
            stream.addRect(MARGIN, y - 24, CONTENT_WIDTH, 24);
            stream.fill();
            setTextColor(19, 67, 118);
            text(BOLD, 11, MARGIN + 8, y - 10, title);
            float titleWidth = BOLD.getStringWidth(sanitize(title)) / 1000 * 11;
            float subtitleX = Math.max(MARGIN + 180, MARGIN + 8 + titleWidth + 18);
            text(REGULAR, 7.5f, subtitleX, y - 10, subtitle);
            y -= 33;
        }

        private void metrics(List<Metric> metrics) throws IOException {
            int columns = 4;
            float gap = 6;
            float boxWidth = (CONTENT_WIDTH - (gap * (columns - 1))) / columns;
            float boxHeight = 38;
            for (int index = 0; index < metrics.size(); index++) {
                if (index > 0 && index % columns == 0) y -= boxHeight + gap;
                ensure(boxHeight + 8);
                int column = index % columns;
                float x = MARGIN + (column * (boxWidth + gap));
                setFill(247, 249, 252);
                stream.addRect(x, y - boxHeight, boxWidth, boxHeight);
                stream.fill();
                setTextColor(20, 35, 55);
                text(BOLD, 14, x + 8, y - 16, metrics.get(index).value());
                setTextColor(91, 105, 125);
                text(REGULAR, 7.5f, x + 8, y - 29, metrics.get(index).label());
            }
            y -= boxHeight + 12;
        }

        private void text(String value) throws IOException {
            ensure(20);
            setTextColor(74, 85, 104);
            for (String line : wrap(value, REGULAR, 8, CONTENT_WIDTH)) {
                text(REGULAR, 8, MARGIN, y, line);
                y -= 10;
            }
            y -= 4;
        }

        private void note(String title, String value) throws IOException {
            section(title.toUpperCase(), "Factory validation remains authoritative.");
            text(value);
        }

        private void table(
                String title,
                String subtitle,
                List<Column> columns,
                List<List<String>> rows
        ) throws IOException {
            newPage();
            section(title, subtitle);
            if (rows.isEmpty()) {
                text("No records matched the selected reporting period and filters.");
                return;
            }
            drawTableHeader(columns);
            for (List<String> row : rows) {
                List<List<String>> wrapped = new ArrayList<>();
                int lineCount = 1;
                for (int index = 0; index < columns.size(); index++) {
                    List<String> lines = wrap(
                            index < row.size() ? row.get(index) : "",
                            REGULAR,
                            7,
                            columns.get(index).width() - 8);
                    wrapped.add(lines);
                    lineCount = Math.max(lineCount, lines.size());
                }
                float rowHeight = Math.max(19, (lineCount * 8.3f) + 7);
                if (y - rowHeight < FOOTER_HEIGHT + 8) {
                    newPage();
                    section(title + " (CONTINUED)", subtitle);
                    drawTableHeader(columns);
                }
                drawTableRow(columns, wrapped, rowHeight);
            }
            y -= 8;
        }

        private void drawTableHeader(List<Column> columns) throws IOException {
            float height = 19;
            setFill(32, 90, 154);
            stream.addRect(MARGIN, y - height, CONTENT_WIDTH, height);
            stream.fill();
            float x = MARGIN;
            for (Column column : columns) {
                setTextColor(255, 255, 255);
                text(BOLD, 7, x + 4, y - 12, column.title());
                x += column.width();
            }
            y -= height;
        }

        private void drawTableRow(
                List<Column> columns,
                List<List<String>> wrapped,
                float height
        ) throws IOException {
            int rowNumber = (int) ((PAGE_SIZE.getHeight() - y) / Math.max(height, 1));
            setFill(rowNumber % 2 == 0 ? 248 : 255, rowNumber % 2 == 0 ? 250 : 255,
                    rowNumber % 2 == 0 ? 253 : 255);
            stream.addRect(MARGIN, y - height, CONTENT_WIDTH, height);
            stream.fill();
            setStroke(220, 226, 234);
            stream.moveTo(MARGIN, y - height);
            stream.lineTo(MARGIN + CONTENT_WIDTH, y - height);
            stream.stroke();

            float x = MARGIN;
            for (int index = 0; index < columns.size(); index++) {
                setTextColor(38, 50, 68);
                float lineY = y - 10;
                for (String line : wrapped.get(index)) {
                    text(index == 0 ? BOLD : REGULAR, 7, x + 4, lineY, line);
                    lineY -= 8.3f;
                }
                x += columns.get(index).width();
            }
            y -= height;
        }

        private void ensure(float required) throws IOException {
            if (y - required < FOOTER_HEIGHT + 8) newPage();
        }

        private void newPage() throws IOException {
            closeStream();
            page = new PDPage(PAGE_SIZE);
            document.addPage(page);
            stream = new PDPageContentStream(document, page);
            y = PAGE_SIZE.getHeight() - MARGIN;
            setTextColor(20, 35, 55);
            text(BOLD, 8, MARGIN, y, "STELLANA " + reportTitle);
            setTextColor(105, 115, 130);
            float scopeWidth = REGULAR.getStringWidth(sanitize(reportScope)) / 1000 * 7;
            text(REGULAR, 7, MARGIN + CONTENT_WIDTH - scopeWidth, y, reportScope);
            y -= 17;
        }

        private void finish() throws IOException {
            closeStream();
            int pageCount = document.getNumberOfPages();
            for (int index = 0; index < pageCount; index++) {
                PDPage footerPage = document.getPage(index);
                try (PDPageContentStream footer = new PDPageContentStream(
                        document,
                        footerPage,
                        PDPageContentStream.AppendMode.APPEND,
                        true,
                        true
                )) {
                    footer.setStrokingColor(new Color(215, 222, 232));
                    footer.moveTo(MARGIN, FOOTER_HEIGHT);
                    footer.lineTo(MARGIN + CONTENT_WIDTH, FOOTER_HEIGHT);
                    footer.stroke();
                    footer.beginText();
                    footer.setFont(REGULAR, 7);
                    footer.setNonStrokingColor(new Color(100, 110, 125));
                    footer.newLineAtOffset(MARGIN, 10);
                    footer.showText("Generated from persisted Stellana production records");
                    footer.endText();
                    footer.beginText();
                    footer.setFont(BOLD, 7);
                    footer.setNonStrokingColor(new Color(70, 82, 100));
                    footer.newLineAtOffset(MARGIN + CONTENT_WIDTH - 45, 10);
                    footer.showText("Page " + (index + 1) + " of " + pageCount);
                    footer.endText();
                }
            }
        }

        private void closeStream() throws IOException {
            if (stream != null) {
                stream.close();
                stream = null;
            }
        }

        private void text(PDFont font, float size, float x, float baseline, String value)
                throws IOException {
            stream.beginText();
            stream.setFont(font, size);
            stream.newLineAtOffset(x, baseline);
            stream.showText(sanitize(value));
            stream.endText();
        }

        private void setFill(int red, int green, int blue) throws IOException {
            stream.setNonStrokingColor(new Color(red, green, blue));
        }

        private void setStroke(int red, int green, int blue) throws IOException {
            stream.setStrokingColor(new Color(red, green, blue));
        }

        private void setTextColor(int red, int green, int blue) throws IOException {
            setFill(red, green, blue);
        }

        private static List<String> wrap(
                String value,
                PDFont font,
                float size,
                float maxWidth
        ) throws IOException {
            List<String> lines = new ArrayList<>();
            String safe = sanitize(value);
            for (String paragraph : safe.split("\\R", -1)) {
                if (paragraph.isBlank()) {
                    lines.add("");
                    continue;
                }
                String current = "";
                for (String word : paragraph.trim().split("\\s+")) {
                    String candidate = current.isEmpty() ? word : current + " " + word;
                    if (font.getStringWidth(candidate) / 1000 * size <= maxWidth) {
                        current = candidate;
                    } else {
                        if (!current.isEmpty()) lines.add(current);
                        current = word;
                    }
                }
                if (!current.isEmpty()) lines.add(current);
            }
            return lines.isEmpty() ? List.of("") : lines;
        }

        private static String sanitize(String value) {
            if (value == null) return "-";
            return value
                    .replace('\u00d7', 'x')
                    .replace('\u2013', '-')
                    .replace('\u2014', '-')
                    .replace('\u2011', '-')
                    .replace('\u00a0', ' ')
                    .replaceAll("[^\\x09\\x0A\\x0D\\x20-\\x7E]", "?");
        }
    }
}
