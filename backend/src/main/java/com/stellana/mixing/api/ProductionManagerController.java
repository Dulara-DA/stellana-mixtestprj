package com.stellana.mixing.api;

import com.stellana.mixing.api.ApiModels.ProductionManagerSummary;
import com.stellana.mixing.api.ApiModels.ProductionGenealogyView;
import com.stellana.mixing.domain.ProductionShift;
import com.stellana.mixing.service.CombinedProductionPdfService;
import com.stellana.mixing.service.ProductionManagerService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/production-manager")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('MANAGER','SYSTEM_ADMIN')")
public class ProductionManagerController {
    private final ProductionManagerService productionManagerService;
    private final CombinedProductionPdfService combinedProductionPdfService;

    @GetMapping("/summary")
    public ProductionManagerSummary summary(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fromDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate toDate,
            @RequestParam(required = false) ProductionShift shift,
            @RequestParam(required = false) Long pressId,
            @RequestParam(required = false) Long operatorId,
            @RequestParam(required = false) String blankingBatch,
            @RequestParam(required = false) String mixingBatch,
            @RequestParam(required = false) String cart,
            @RequestParam(required = false) String material
    ) {
        return productionManagerService.summary(
                fromDate, toDate, shift, pressId, operatorId,
                blankingBatch, mixingBatch, cart, material);
    }

    @GetMapping(value = "/report.pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<byte[]> combinedPdf(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fromDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate toDate,
            @RequestParam(required = false) ProductionShift shift,
            @RequestParam(required = false) Long pressId,
            @RequestParam(required = false) Long operatorId,
            @RequestParam(required = false) String blankingBatch,
            @RequestParam(required = false) String mixingBatch,
            @RequestParam(required = false) String cart,
            @RequestParam(required = false) String material
    ) {
        CombinedProductionPdfService.GeneratedPdf report = combinedProductionPdfService.generate(
                fromDate, toDate, shift, pressId, operatorId,
                blankingBatch, mixingBatch, cart, material);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(report.filename())
                        .build()
                        .toString())
                .contentType(MediaType.APPLICATION_PDF)
                .contentLength(report.content().length)
                .body(report.content());
    }

    @GetMapping("/genealogy/{mixingBatchNumber}")
    public ProductionGenealogyView genealogy(@PathVariable String mixingBatchNumber) {
        return productionManagerService.genealogy(mixingBatchNumber);
    }
}
