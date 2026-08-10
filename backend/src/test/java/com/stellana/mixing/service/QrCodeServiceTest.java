package com.stellana.mixing.service;

import com.google.zxing.BinaryBitmap;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.client.j2se.BufferedImageLuminanceSource;
import com.google.zxing.common.HybridBinarizer;
import com.stellana.mixing.domain.ProductionBatch;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import javax.imageio.ImageIO;
import java.io.ByteArrayInputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class QrCodeServiceTest {
    @Mock
    private BatchService batchService;

    private QrCodeService qrCodeService;

    @BeforeEach
    void setUp() {
        qrCodeService = new QrCodeService(batchService);
        ReflectionTestUtils.setField(qrCodeService, "traceabilityBaseUrl", "http://localhost:5173/trace");
        when(batchService.requireBatch(24L)).thenReturn(ProductionBatch.builder()
                .traceabilityCode("safe-batch-reference")
                .build());
    }

    @Test
    void usesTheFrontendNetworkOriginForTheQrUrl() throws Exception {
        byte[] png = qrCodeService.generateForBatch(24L, "http://192.168.1.253:5173");

        assertThat(decode(png))
                .isEqualTo("http://192.168.1.253:5173/trace/safe-batch-reference");
    }

    @Test
    void rejectsUnsafeOriginsAndUsesTheConfiguredFallback() throws Exception {
        byte[] png = qrCodeService.generateForBatch(24L, "javascript:alert(1)");

        assertThat(decode(png))
                .isEqualTo("http://localhost:5173/trace/safe-batch-reference");
    }

    private String decode(byte[] png) throws Exception {
        var image = ImageIO.read(new ByteArrayInputStream(png));
        var bitmap = new BinaryBitmap(new HybridBinarizer(new BufferedImageLuminanceSource(image)));
        return new MultiFormatReader().decode(bitmap).getText();
    }
}
