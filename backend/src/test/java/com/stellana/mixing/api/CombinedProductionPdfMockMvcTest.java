package com.stellana.mixing.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import javax.imageio.ImageIO;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CombinedProductionPdfMockMvcTest {
    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;

    @Test
    void managerDownloadsCombinedPdfContainingAllThreeProductionSections() throws Exception {
        String managerToken = login("manager@stellana.local", "Manager123!");
        String date = LocalDate.now().toString();
        byte[] pdf = mockMvc.perform(get("/api/production-manager/report.pdf")
                        .queryParam("fromDate", date)
                        .queryParam("toDate", date)
                        .header("Authorization", "Bearer " + managerToken))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", MediaType.APPLICATION_PDF_VALUE))
                .andExpect(header().string("Content-Disposition",
                        org.hamcrest.Matchers.containsString(
                                "stellana-combined-production-report-" + date + "-to-" + date + ".pdf")))
                .andReturn()
                .getResponse()
                .getContentAsByteArray();

        assertThat(pdf).hasSizeGreaterThan(3_000);
        assertThat(new String(pdf, 0, 4)).isEqualTo("%PDF");

        try (PDDocument document = Loader.loadPDF(pdf)) {
            assertThat(document.getNumberOfPages()).isGreaterThanOrEqualTo(4);
            String text = new PDFTextStripper().getText(document);
            assertThat(text)
                    .contains("COMBINED PRODUCTION REPORT")
                    .contains("MIXING RECORDS")
                    .contains("BLANKING RECORDS")
                    .contains("BLANKING TO MOULDING CARTS")
                    .contains("MOULDING RECORDS")
                    .contains("BLANK RETURNS")
                    .contains("RET-A96-CLOSED")
                    .contains("BLK-DEMO-001")
                    .contains("CART-DEMO-001")
                    .contains("PRESS-02");

            Path previewDirectory = Path.of("target", "pdf-preview");
            Files.createDirectories(previewDirectory);
            PDFRenderer renderer = new PDFRenderer(document);
            for (int page = 0; page < document.getNumberOfPages(); page++) {
                ImageIO.write(
                        renderer.renderImageWithDPI(page, 120),
                        "png",
                        previewDirectory.resolve("combined-production-report-page-" + (page + 1) + ".png").toFile());
            }
        }
    }

    @Test
    void mixingOfficerCannotDownloadManagementPdf() throws Exception {
        String officerToken = login("officer@stellana.local", "Mixing123!");
        mockMvc.perform(get("/api/production-manager/report.pdf")
                        .header("Authorization", "Bearer " + officerToken))
                .andExpect(status().isForbidden());
    }

    @Test
    void managerDownloadsOneSelectedSectionAndLoadsSeparatedRecordRows() throws Exception {
        String managerToken = login("manager@stellana.local", "Manager123!");
        String date = LocalDate.now().toString();

        mockMvc.perform(get("/api/production-manager/records")
                        .queryParam("fromDate", date)
                        .queryParam("toDate", date)
                        .header("Authorization", "Bearer " + managerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mixingRecords").isArray())
                .andExpect(jsonPath("$.blankingRecords").isArray())
                .andExpect(jsonPath("$.mouldingRecords").isArray());

        byte[] pdf = mockMvc.perform(get("/api/production-manager/report.pdf")
                        .queryParam("section", "MIXING")
                        .queryParam("fromDate", date)
                        .queryParam("toDate", date)
                        .header("Authorization", "Bearer " + managerToken))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition",
                        org.hamcrest.Matchers.containsString(
                                "stellana-mixing-production-report-" + date + "-to-" + date + ".pdf")))
                .andReturn()
                .getResponse()
                .getContentAsByteArray();

        try (PDDocument document = Loader.loadPDF(pdf)) {
            String text = new PDFTextStripper().getText(document);
            assertThat(text)
                    .contains("MIXING PRODUCTION REPORT")
                    .contains("MIXING RECORDS")
                    .doesNotContain("BLANKING RECORDS")
                    .doesNotContain("MOULDING RECORDS");
            Path previewDirectory = Path.of("target", "pdf-preview");
            Files.createDirectories(previewDirectory);
            PDFRenderer renderer = new PDFRenderer(document);
            for (int page = 0; page < document.getNumberOfPages(); page++) {
                ImageIO.write(
                        renderer.renderImageWithDPI(page, 120),
                        "png",
                        previewDirectory.resolve(
                                "mixing-production-report-page-" + (page + 1) + ".png").toFile());
            }
        }
    }

    private String login(String email, String password) throws Exception {
        ObjectNode request = objectMapper.createObjectNode().put("email", email).put("password", password);
        String response = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        JsonNode payload = objectMapper.readTree(response);
        return payload.get("token").asText();
    }
}
