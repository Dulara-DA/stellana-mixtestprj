package com.stellana.mixing.service;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.WriterException;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.stellana.mixing.domain.ProductionBatch;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;

@Service
@RequiredArgsConstructor
public class QrCodeService {
    private final BatchService batchService;

    @Value("${app.traceability-base-url}")
    private String traceabilityBaseUrl;

    public byte[] generateForBatch(Long batchId) {
        return generateForBatch(batchId, null);
    }

    public byte[] generateForBatch(Long batchId, String frontendOrigin) {
        ProductionBatch batch = batchService.requireBatch(batchId);
        String safeUrl = resolveTraceabilityBaseUrl(frontendOrigin) + "/" + batch.getTraceabilityCode();
        try {
            BitMatrix matrix = new QRCodeWriter().encode(safeUrl, BarcodeFormat.QR_CODE, 320, 320);
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            MatrixToImageWriter.writeToStream(matrix, "PNG", output);
            return output.toByteArray();
        } catch (WriterException | IOException exception) {
            throw new IllegalStateException("Unable to generate the QR code.", exception);
        }
    }

    private String resolveTraceabilityBaseUrl(String frontendOrigin) {
        if (frontendOrigin == null || frontendOrigin.isBlank()) {
            return withoutTrailingSlash(traceabilityBaseUrl);
        }
        try {
            URI origin = new URI(frontendOrigin.trim());
            boolean safeScheme = "http".equalsIgnoreCase(origin.getScheme())
                    || "https".equalsIgnoreCase(origin.getScheme());
            boolean originOnly = (origin.getPath() == null || origin.getPath().isEmpty() || "/".equals(origin.getPath()))
                    && origin.getQuery() == null
                    && origin.getFragment() == null
                    && origin.getUserInfo() == null;
            if (!safeScheme || origin.getHost() == null || !originOnly) {
                return withoutTrailingSlash(traceabilityBaseUrl);
            }
            URI normalizedOrigin = new URI(
                    origin.getScheme().toLowerCase(),
                    null,
                    origin.getHost(),
                    origin.getPort(),
                    null,
                    null,
                    null);
            return withoutTrailingSlash(normalizedOrigin.toString()) + "/trace";
        } catch (URISyntaxException exception) {
            return withoutTrailingSlash(traceabilityBaseUrl);
        }
    }

    private String withoutTrailingSlash(String value) {
        return value != null && value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }
}
