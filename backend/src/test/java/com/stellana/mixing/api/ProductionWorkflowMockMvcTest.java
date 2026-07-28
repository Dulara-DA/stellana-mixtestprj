package com.stellana.mixing.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ProductionWorkflowMockMvcTest {
    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;

    @Test
    void demonstratesTheMainPassAndMailboxWorkflow() throws Exception {
        String managerToken = login("manager@stellana.local", "Manager123!");
        String officerToken = login("officer@stellana.local", "Mixing123!");

        JsonNode recipes = getJson("/api/recipes/active", managerToken);
        JsonNode officers = getJson("/api/users/officers", managerToken);
        long revisionId = recipes.get(0).get("id").asLong();
        String recipeCode = recipes.get(0).get("recipeCode").asText();
        long officerId = officers.get(0).get("id").asLong();

        ObjectNode officerBatchRequest = objectMapper.createObjectNode()
                .put("batchNumber", "TEST-OFFICER-001")
                .put("recipeRevisionId", revisionId)
                .put("plannedQuantityKg", 175.0)
                .put("machine", "Test Mixer");
        JsonNode officerCreatedBatch = postJson("/api/batches", officerToken, officerBatchRequest);
        assertThat(officerCreatedBatch.get("assignedOfficer").get("id").asLong()).isEqualTo(officerId);
        assertThat(officerCreatedBatch.get("status").asText()).isEqualTo("PLANNED");
        JsonNode officerDashboard = getJson("/api/dashboard", officerToken);
        assertThat(officerDashboard.get("batchBoard"))
                .anyMatch(node -> "TEST-OFFICER-001".equals(node.get("batchNumber").asText()));

        ObjectNode batchRequest = objectMapper.createObjectNode()
                .put("batchNumber", "TEST-FLOW-001")
                .put("recipeRevisionId", revisionId)
                .put("plannedQuantityKg", 180.0)
                .put("machine", "Test Mixer")
                .put("assignedOfficerId", officerId);
        JsonNode batch = postJson("/api/batches", managerToken, batchRequest);
        long batchId = batch.get("id").asLong();
        assertThat(batch.get("factoryReference").asText()).isEqualTo(recipeCode + " × TEST-FLOW-001");

        ObjectNode materialRequest = objectMapper.createObjectNode()
                .put("batchId", batchId)
                .put("notes", "End-to-end test request");
        materialRequest.set("items", objectMapper.createArrayNode());
        JsonNode materials = postJson("/api/material-requests", officerToken, materialRequest);

        ArrayNode issueItems = objectMapper.createArrayNode();
        materials.get("items").forEach(item -> issueItems.add(objectMapper.createObjectNode()
                .put("itemId", item.get("id").asLong())
                .put("issuedQuantity", item.get("requestedQuantity").asDouble())
                .put("rawMaterialLotNumber", "TEST-LOT")));
        ObjectNode issueRequest = objectMapper.createObjectNode().put("notes", "Full issue");
        issueRequest.set("items", issueItems);
        postJson("/api/material-requests/" + materials.get("id").asLong() + "/issue", managerToken, issueRequest);

        ObjectNode startStage1 = objectMapper.createObjectNode()
                .put("batchId", batchId).put("stageNumber", 1).put("machine", "Test Mixer")
                .put("managerOverride", false);
        JsonNode stage1 = postJson("/api/stages/start", officerToken, startStage1);
        assertThat(stage1.get("startTime").isNull()).isFalse();
        assertThat(stage1.get("endTime").isNull()).isTrue();
        assertThat(stage1.get("factoryReference").asText()).isEqualTo(recipeCode + " × TEST-FLOW-001");
        JsonNode completedStage1 = postJson("/api/stages/" + stage1.get("id").asLong() + "/complete", officerToken,
                completionRequest(179.5, "Stage 1 test complete"));
        assertThat(completedStage1.get("endTime").isNull()).isFalse();
        mockMvc.perform(get("/api/batches/{id}", batchId)
                        .header("Authorization", "Bearer " + managerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("READY_FOR_STAGE_2"))
                .andExpect(jsonPath("$.stage1StartedAt").isNotEmpty())
                .andExpect(jsonPath("$.stage1CompletedAt").isNotEmpty());

        ObjectNode startStage2 = objectMapper.createObjectNode()
                .put("batchId", batchId).put("stageNumber", 2).put("machine", "Test Mixer")
                .put("managerOverride", false);
        JsonNode stage2 = postJson("/api/stages/start", officerToken, startStage2);
        assertThat(stage2.get("startTime").isNull()).isFalse();
        JsonNode completedStage2 = postJson("/api/stages/" + stage2.get("id").asLong() + "/complete", officerToken,
                completionRequest(178.8, "Stage 2 test complete"));
        assertThat(completedStage2.get("endTime").isNull()).isFalse();

        JsonNode sample = postJson("/api/lab/batches/" + batchId + "/send-sample", officerToken,
                objectMapper.createObjectNode());
        ObjectNode labResult = objectMapper.createObjectNode()
                .put("hardness", 65.0)
                .put("resilience", 47.0)
                .put("curingTimeMinutes", 6.5)
                .put("decision", "PASS")
                .put("comments", "Test workflow pass; not an acceptance specification.")
                .put("reprocessingDecision", false);
        labResult.set("additionalResults", objectMapper.createArrayNode());
        postJson("/api/lab/samples/" + sample.get("id").asLong() + "/results", managerToken, labResult);

        postJson("/api/batches/" + batchId + "/transition", managerToken,
                objectMapper.createObjectNode().put("status", "RELEASED_TO_BLANKING").put("reason", "Test release"));
        mockMvc.perform(get("/api/batches/{id}", batchId)
                        .header("Authorization", "Bearer " + managerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RELEASED_TO_BLANKING"))
                .andExpect(jsonPath("$.laboratoryStatus").value("PASS"))
                .andExpect(jsonPath("$.releaseStatus").value("APPROVED_FOR_BLANKING"));

        ObjectNode issue = objectMapper.createObjectNode()
                .put("batchId", batchId)
                .put("priority", "HIGH")
                .put("subject", "Test workflow issue")
                .put("message", "Officer requires a manager response.");
        JsonNode createdIssue = postJson("/api/issues", officerToken, issue);
        postJson("/api/issues/" + createdIssue.get("id").asLong() + "/reply", managerToken,
                objectMapper.createObjectNode().put("message", "Manager response recorded."));

        JsonNode history = getJson("/api/batches/" + batchId + "/history", managerToken);
        assertThat(history).anyMatch(node -> "RELEASED_TO_BLANKING".equals(node.get("newStatus").asText()));
    }

    private ObjectNode completionRequest(double actualQuantity, String notes) {
        return objectMapper.createObjectNode()
                .put("actualQuantity", actualQuantity)
                .put("temperatureCelsius", 95.0)
                .put("mixingTimeSeconds", 600)
                .put("speedRpm", 42.0)
                .put("notes", notes);
    }

    private String login(String email, String password) throws Exception {
        ObjectNode request = objectMapper.createObjectNode().put("email", email).put("password", password);
        return postJson("/api/auth/login", null, request).get("token").asText();
    }

    private JsonNode getJson(String path, String token) throws Exception {
        String response = mockMvc.perform(get(path).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response);
    }

    private JsonNode postJson(String path, String token, JsonNode body) throws Exception {
        var request = post(path).contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(body));
        if (token != null) {
            request.header("Authorization", "Bearer " + token);
        }
        String response = mockMvc.perform(request)
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response);
    }
}
