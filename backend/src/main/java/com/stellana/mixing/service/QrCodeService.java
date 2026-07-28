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

@Service
@RequiredArgsConstructor
public class QrCodeService {
    private final BatchService batchService;

    @Value("${app.traceability-base-url}")
    private String traceabilityBaseUrl;

    public byte[] generateForBatch(Long batchId) {
        ProductionBatch batch = batchService.requireBatch(batchId);
        String safeUrl = traceabilityBaseUrl + "/" + batch.getTraceabilityCode();
        try {
            BitMatrix matrix = new QRCodeWriter().encode(safeUrl, BarcodeFormat.QR_CODE, 320, 320);
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            MatrixToImageWriter.writeToStream(matrix, "PNG", output);
            return output.toByteArray();
        } catch (WriterException | IOException exception) {
            throw new IllegalStateException("Unable to generate the QR code.", exception);
        }
    }
}
