package com.stellana.mixing.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class TemporaryLabBypassReleaseMockMvcTest {
    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;

    @Test
    void managerCanExplicitlyReleaseAStage2CompletedBatchWithoutRecordingAFakeLabPass() throws Exception {
        String managerToken = login("manager@stellana.local", "Manager123!");
        String officerToken = login("officer@stellana.local", "Mixing123!");
        String adminToken = login("admin@stellana.local", "Admin123!");
        long revisionId = getJson("/api/recipes/active", managerToken).get(0).path("id").asLong();
        long officerId = getJson("/api/users/officers", managerToken).get(0).path("id").asLong();
        String suffix = UUID.randomUUID().toString().substring(0, 8).toUpperCase();

        JsonNode batch = postJson("/api/batches", managerToken, objectMapper.createObjectNode()
                .put("batchNumber", "TEMP-LAB-" + suffix)
                .put("recipeRevisionId", revisionId)
                .put("plannedQuantityKg", 180)
                .put("machine", "Temporary Release Test Mixer")
                .put("assignedOfficerId", officerId));
        long batchId = batch.path("id").asLong();

        postJson("/api/batches/" + batchId + "/transition", managerToken,
                transition("READY_FOR_STAGE_1", "Prototype material preparation confirmed.", false));
        JsonNode stage1 = postJson("/api/stages/start", officerToken, objectMapper.createObjectNode()
                .put("batchId", batchId)
                .put("stageNumber", 1)
                .put("machine", "Temporary Release Test Mixer")
                .put("managerOverride", false));
        postJson("/api/stages/" + stage1.path("id").asLong() + "/complete", officerToken,
                completion(179, "Stage 1 complete."));

        JsonNode stage2 = postJson("/api/stages/start", officerToken, objectMapper.createObjectNode()
                .put("batchId", batchId)
                .put("stageNumber", 2)
                .put("machine", "Temporary Release Test Mixer")
                .put("managerOverride", false));
        postJson("/api/stages/" + stage2.path("id").asLong() + "/complete", officerToken,
                completion(178, "Stage 2 complete."));

        postExpectConflict("/api/batches/" + batchId + "/transition", managerToken,
                transition("RELEASED_TO_BLANKING", "Lab unit is under development.", false));
        postExpectConflict("/api/batches/" + batchId + "/transition", officerToken,
                transition("RELEASED_TO_BLANKING", "Officer cannot authorize this bypass.", true));

        String releaseReason = "Laboratory unit is under development; production manager authorized temporary release.";
        JsonNode released = postJson("/api/batches/" + batchId + "/transition", managerToken,
                transition("RELEASED_TO_BLANKING", releaseReason, true));
        assertThat(released.path("status").asText()).isEqualTo("RELEASED_TO_BLANKING");
        assertThat(released.path("releaseStatus").asText()).isEqualTo("APPROVED_FOR_BLANKING");
        assertThat(released.path("laboratoryStatus").asText()).isEqualTo("PENDING");
        assertThat(released.path("temporaryLabBypass").asBoolean()).isTrue();
        assertThat(released.path("temporaryLabBypassReason").asText()).isEqualTo(releaseReason);
        assertThat(released.path("temporaryLabBypassApprovedBy").path("role").asText()).isEqualTo("MANAGER");

        JsonNode stock = getJson("/api/blanking/compound-stock", managerToken);
        JsonNode temporaryStock = null;
        for (JsonNode candidate : stock) {
            if (candidate.path("mixingBatchId").asLong() == batchId) {
                temporaryStock = candidate;
                break;
            }
        }
        assertThat(temporaryStock).isNotNull();
        assertThat(temporaryStock.path("labStatus").asText()).isEqualTo("PENDING");
        assertThat(temporaryStock.path("temporaryLabBypass").asBoolean()).isTrue();
        assertThat(temporaryStock.path("notes").asText()).contains("not a laboratory PASS");

        JsonNode blankingBatch = postJson("/api/blanking/batches", adminToken,
                objectMapper.createObjectNode()
                        .put("batchNumber", "BLK-TEMP-" + suffix)
                        .put("approvedMaterialBatchId", temporaryStock.path("id").asLong())
                        .put("materialConsumedKg", 10)
                        .put("plannedProductionQuantity", 100)
                        .put("averageBlankWeightGrams", 100)
                        .put("startImmediately", false));
        assertThat(blankingBatch.path("mixingBatchNumber").asText()).isEqualTo("TEMP-LAB-" + suffix);

        JsonNode audit = getJson("/api/audit?limit=500", managerToken);
        assertThat(audit.toString()).contains("TEMPORARY_RELEASE_WITHOUT_LAB", releaseReason);
    }

    private ObjectNode transition(String statusValue, String reason, boolean temporaryBypass) {
        return objectMapper.createObjectNode()
                .put("status", statusValue)
                .put("reason", reason)
                .put("temporaryLabBypass", temporaryBypass);
    }

    private ObjectNode completion(double actualQuantity, String notes) {
        return objectMapper.createObjectNode()
                .put("actualQuantity", actualQuantity)
                .put("temperatureCelsius", 95)
                .put("mixingTimeSeconds", 600)
                .put("speedRpm", 42)
                .put("notes", notes);
    }

    private String login(String email, String password) throws Exception {
        return postJson("/api/auth/login", null, objectMapper.createObjectNode()
                .put("email", email)
                .put("password", password)).path("token").asText();
    }

    private JsonNode getJson(String pathValue, String token) throws Exception {
        String response = mockMvc.perform(get(pathValue)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response);
    }

    private JsonNode postJson(String pathValue, String token, JsonNode body) throws Exception {
        var request = post(pathValue)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body));
        if (token != null) {
            request.header("Authorization", "Bearer " + token);
        }
        String response = mockMvc.perform(request)
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response);
    }

    private void postExpectConflict(String pathValue, String token, JsonNode body) throws Exception {
        mockMvc.perform(post(pathValue)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isConflict());
    }

}
