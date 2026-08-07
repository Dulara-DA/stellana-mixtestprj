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

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DownstreamProductionMockMvcTest {
    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;

    @Test
    void createsAndCompletesBlankingBatchFromTemporaryManualMixingReference() throws Exception {
        String adminToken = login("admin@stellana.local", "Admin123!");
        JsonNode created = postJson("/api/blanking/batches", adminToken,
                objectMapper.createObjectNode()
                        .put("batchNumber", "BLK-MANUAL-ENTRY")
                        .put("mixingBatchNumber", "6199")
                        .put("materialCode", "A-96-50")
                        .put("materialConsumedKg", 5)
                        .put("plannedProductionQuantity", 50)
                        .put("averageBlankWeightGrams", 100)
                        .put("itemCode", "UG 200×50")
                        .put("millOperator", "Manual Test Mill Operator")
                        .put("preformerOperator", "Manual Test Preformer Operator")
                        .put("startImmediately", true));

        assertThat(created.path("approvedMaterialBatchId").isNull()).isTrue();
        assertThat(created.path("mixingBatchNumber").asText()).isEqualTo("6199");
        assertThat(created.path("materialCode").asText()).isEqualTo("A-96-50");
        assertThat(created.path("status").asText()).isEqualTo("IN_PROGRESS");

        JsonNode completed = postJson(
                "/api/blanking/batches/" + created.path("id").asLong() + "/complete",
                adminToken,
                objectMapper.createObjectNode()
                        .put("productionQuantity", 40)
                        .put("actualGoodBlankQuantity", 40)
                        .put("rejectedQuantity", 0)
                        .put("rejectedMaterialWeightKg", 0)
                        .put("measuredRemainingCompoundWeightKg", 1)
                        .put("supervisorConfirmation", false)
                        .put("notes", "Manual source completion test."));

        assertThat(completed.path("status").asText()).isEqualTo("READY");
        assertThat(completed.path("actualUsedCompoundWeightKg").decimalValue())
                .isEqualByComparingTo("4.000");
        assertThat(completed.path("remainingCompoundWeightKg").decimalValue())
                .isEqualByComparingTo("1.000");
    }

    @Test
    void enforcesRoleBoundariesAndCompletesCartToPressWorkflow() throws Exception {
        String mixingToken = login("officer@stellana.local", "Mixing123!");
        String mouldingToken = login("moulding.operator@stellana.local", "Moulding123!");

        mockMvc.perform(get("/api/blanking/approved-materials")
                        .header("Authorization", "Bearer " + mixingToken))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("You are not authorized to perform this action."));

        JsonNode carts = getJson("/api/blanking/carts", mouldingToken);
        JsonNode cart = find(carts, "cartNumber", "CART-DEMO-001");
        long cartId = cart.get("id").asLong();
        long pressId = cart.get("destinationPressId").asLong();

        ObjectNode receiveRequest = objectMapper.createObjectNode()
                .put("pressId", pressId)
                .put("supervisorOverride", false);
        JsonNode receipt = postJson("/api/moulding/carts/" + cartId + "/receive", mouldingToken, receiveRequest);
        assertThat(receipt.get("receivedQuantity").asInt()).isEqualTo(40);
        assertThat(receipt.get("receivingOperatorEmployeeId").asText()).isEqualTo("MLD-001");
        assertThat(receipt.get("receiptStatus").asText()).isEqualTo("RECEIVED");

        mockMvc.perform(post("/api/moulding/carts/{id}/receive", cartId)
                        .header("Authorization", "Bearer " + mouldingToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(receiveRequest)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Only a dispatched cart can be received."));

        JsonNode record = postJson("/api/moulding/records/start", mouldingToken,
                objectMapper.createObjectNode().put("pressId", pressId).put("cartId", cartId));
        long recordId = record.get("id").asLong();
        assertThat(record.get("quantityReceived").asInt()).isEqualTo(40);
        assertThat(record.get("startTime").isNull()).isFalse();
        assertThat(record.get("operatorEmployeeId").asText()).isEqualTo("MLD-001");

        ObjectNode excessive = completion(40, 1, 1, 1000, 0, "");
        mockMvc.perform(post("/api/moulding/records/{id}/complete", recordId)
                        .header("Authorization", "Bearer " + mouldingToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(excessive)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(
                        "Good, rejected tyre, and rejected blank quantities exceed received blanks."));

        JsonNode completed = postJson("/api/moulding/records/" + recordId + "/complete", mouldingToken,
                completion(34, 2, 1, 1100, 5, "Press setting adjustment"));
        assertThat(completed.get("status").asText()).isEqualTo("COMPLETED");
        assertThat(completed.get("remainingBlankQuantity").asInt()).isEqualTo(3);
        assertThat(completed.get("totalRejectedTyreWeightGrams").decimalValue())
                .isEqualByComparingTo("2200");

        JsonNode presses = getJson("/api/moulding/presses", mouldingToken);
        JsonNode press = find(presses, "id", String.valueOf(pressId));
        assertThat(press.get("availableBlankQuantity").asInt()).isEqualTo(3);
        assertThat(press.get("goodTyreQuantity").asInt()).isEqualTo(34);
        assertThat(press.get("rejectedTyreQuantity").asInt()).isEqualTo(2);
        assertThat(press.get("rejectedBlankQuantity").asInt()).isEqualTo(1);

        String managerToken = login("manager@stellana.local", "Manager123!");
        JsonNode audit = getJson("/api/audit?limit=500", managerToken);
        assertThat(audit).anyMatch(node ->
                "COMPLETE_MOULDING_RECORD".equals(node.get("action").asText())
                        && node.get("newValue").asText().contains("good 34"));
    }

    @Test
    void rejectsCartQuantityAboveBlankingBatchInventory() throws Exception {
        String blankingToken = login("blanking.operator@stellana.local", "Blanking123!");
        JsonNode batches = getJson("/api/blanking/batches", blankingToken);
        JsonNode batch = find(batches, "batchNumber", "BLK-DEMO-001");
        JsonNode presses = getJson("/api/moulding/presses", blankingToken);
        int excessiveQuantity = batch.get("availableGoodBlankQuantity").asInt() + 1;

        ObjectNode request = objectMapper.createObjectNode()
                .put("cartNumber", "CART-OVER-INVENTORY")
                .put("blankingBatchId", batch.get("id").asLong())
                .put("quantity", excessiveQuantity)
                .put("averageBlankWeightGrams", 100)
                .put("destinationPressId", presses.get(0).get("id").asLong())
                .put("blankingNote", "Must be rejected by backend inventory validation.");
        mockMvc.perform(post("/api/blanking/carts")
                        .header("Authorization", "Bearer " + blankingToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(
                        "Cart quantity exceeds the available good blank quantity."));
    }

    @Test
    void shortageConversationUsesControlledStatusTransitions() throws Exception {
        String mouldingToken = login("moulding.operator@stellana.local", "Moulding123!");
        String blankingToken = login("blanking.operator@stellana.local", "Blanking123!");
        JsonNode presses = getJson("/api/moulding/presses", mouldingToken);
        long pressId = presses.get(0).get("id").asLong();

        ObjectNode createRequest = objectMapper.createObjectNode()
                .put("pressId", pressId)
                .put("requestedBlankQuantity", 25)
                .put("requiredMaterialCode", "A159")
                .put("requiredAt", LocalDateTime.now().plusHours(2).withNano(0).toString())
                .put("priority", "URGENT")
                .put("message", "Press inventory is below the expected next run.");
        JsonNode created = postJson("/api/shortages", mouldingToken, createRequest);
        long requestId = created.get("id").asLong();
        assertThat(created.get("status").asText()).isEqualTo("OPEN");
        assertThat(created.get("messages")).hasSize(1);

        ObjectNode acknowledge = objectMapper.createObjectNode()
                .put("status", "ACKNOWLEDGED")
                .put("response", "Blanking has accepted the request.");
        JsonNode updated = patchJson("/api/shortages/" + requestId + "/status", blankingToken, acknowledge);
        assertThat(updated.get("status").asText()).isEqualTo("ACKNOWLEDGED");
        assertThat(updated.get("messages")).hasSize(2);

        ObjectNode invalid = objectMapper.createObjectNode().put("status", "FULFILLED");
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .patch("/api/shortages/{id}/status", requestId)
                        .header("Authorization", "Bearer " + blankingToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(invalid)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(
                        "Invalid shortage transition from ACKNOWLEDGED to FULFILLED."));
    }

    @Test
    void systemAdministratorCanPerformAllDownstreamOperationalControls() throws Exception {
        String adminToken = login("admin@stellana.local", "Admin123!");
        JsonNode approvedMaterials = getJson("/api/blanking/approved-materials", adminToken);
        JsonNode approved = approvedMaterials.get(0);
        JsonNode presses = getJson("/api/moulding/presses", adminToken);
        JsonNode press = presses.get(presses.size() - 1);

        ObjectNode createBatch = objectMapper.createObjectNode()
                .put("batchNumber", "BLK-ADMIN-CONTROL")
                .put("approvedMaterialBatchId", approved.get("id").asLong())
                .put("materialConsumedKg", 1)
                .put("notes", "Administrator permission regression test.")
                .put("startImmediately", false);
        JsonNode batch = postJson("/api/blanking/batches", adminToken, createBatch);
        long batchId = batch.get("id").asLong();
        assertThat(batch.get("status").asText()).isEqualTo("PLANNED");
        assertThat(batch.get("averageBlankWeightGrams").isNull()).isTrue();
        assertThat(batch.get("expectedBlankQuantity").isNull()).isTrue();

        JsonNode startedBatch = postJson("/api/blanking/batches/" + batchId + "/start",
                adminToken, objectMapper.createObjectNode());
        assertThat(startedBatch.get("status").asText()).isEqualTo("IN_PROGRESS");

        JsonNode completedBatch = postJson("/api/blanking/batches/" + batchId + "/complete",
                adminToken, objectMapper.createObjectNode()
                        .put("productionQuantity", 5)
                        .put("rejectedQuantity", 0)
                        .put("notes", "Completed by administrator."));
        assertThat(completedBatch.get("availableGoodBlankQuantity").asInt()).isEqualTo(5);

        JsonNode cart = postJson("/api/blanking/carts", adminToken,
                objectMapper.createObjectNode()
                        .put("cartNumber", "CART-ADMIN-CONTROL")
                        .put("blankingBatchId", batchId)
                        .put("quantity", 5)
                        .put("averageBlankWeightGrams", 100)
                        .put("destinationPressId", press.get("id").asLong())
                        .put("blankingNote", "Administrator prepared cart."));
        long cartId = cart.get("id").asLong();
        JsonNode dispatched = postJson("/api/blanking/carts/" + cartId + "/dispatch",
                adminToken, objectMapper.createObjectNode().put("note", "Administrator dispatch."));
        assertThat(dispatched.get("status").asText()).isEqualTo("DISPATCHED");

        postJson("/api/moulding/carts/" + cartId + "/receive", adminToken,
                objectMapper.createObjectNode()
                        .put("pressId", press.get("id").asLong())
                        .put("supervisorOverride", false));
        JsonNode production = postJson("/api/moulding/records/start", adminToken,
                objectMapper.createObjectNode()
                        .put("pressId", press.get("id").asLong())
                        .put("cartId", cartId));
        String mouldingOperatorToken = login("moulding.operator@stellana.local", "Moulding123!");
        mockMvc.perform(post("/api/moulding/records/" + production.get("id").asLong() + "/complete")
                        .header("Authorization", "Bearer " + mouldingOperatorToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(completion(4, 1, 0, 900, 0, ""))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(
                        "Only the press-entry operator who started this record may complete it."));
        JsonNode completed = postJson("/api/moulding/records/" + production.get("id").asLong() + "/complete",
                adminToken, completion(4, 1, 0, 900, 0, ""));
        assertThat(completed.get("status").asText()).isEqualTo("COMPLETED");

        JsonNode shortage = postJson("/api/shortages", adminToken,
                objectMapper.createObjectNode()
                        .put("pressId", press.get("id").asLong())
                        .put("requestedBlankQuantity", 10)
                        .put("requiredMaterialCode", completedBatch.get("materialCode").asText())
                        .put("requiredAt", LocalDateTime.now().plusHours(2).withNano(0).toString())
                        .put("priority", "NORMAL")
                        .put("message", "Administrator-created shortage request."));
        assertThat(shortage.get("status").asText()).isEqualTo("OPEN");
    }

    @Test
    void mouldingOperatorCanSelectAndPersistTheOngoingPressItem() throws Exception {
        String mouldingToken = login("moulding.operator@stellana.local", "Moulding123!");
        JsonNode press = getJson("/api/moulding/presses", mouldingToken).get(0);

        JsonNode updated = patchJson(
                "/api/moulding/presses/" + press.get("id").asLong() + "/current-item",
                mouldingToken,
                objectMapper.createObjectNode().put("itemCode", "UG500x50"));

        assertThat(updated.get("currentItemCode").asText()).isEqualTo("UG500x50");
        JsonNode persisted = find(getJson("/api/moulding/presses", mouldingToken),
                "id", press.get("id").asText());
        assertThat(persisted.get("currentItemCode").asText()).isEqualTo("UG500x50");
    }

    private ObjectNode completion(
            int good, int rejectedTyres, int rejectedBlanks, int weightGrams,
            int downtime, String downtimeReason
    ) {
        return objectMapper.createObjectNode()
                .put("goodTyreQuantity", good)
                .put("rejectedTyreQuantity", rejectedTyres)
                .put("rejectedTyreWeightPerItemGrams", weightGrams)
                .put("rejectedBlankQuantity", rejectedBlanks)
                .put("downtimeMinutes", downtime)
                .put("downtimeReason", downtimeReason)
                .put("operatorNote", "MockMvc downstream workflow");
    }

    private String login(String email, String password) throws Exception {
        ObjectNode request = objectMapper.createObjectNode().put("email", email).put("password", password);
        return postJson("/api/auth/login", null, request).get("token").asText();
    }

    private JsonNode getJson(String path, String token) throws Exception {
        String response = mockMvc.perform(get(path).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response);
    }

    private JsonNode postJson(String path, String token, JsonNode body) throws Exception {
        var request = post(path).contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body));
        if (token != null) request.header("Authorization", "Bearer " + token);
        String response = mockMvc.perform(request).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response);
    }

    private JsonNode patchJson(String path, String token, JsonNode body) throws Exception {
        String response = mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .patch(path)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response);
    }

    private JsonNode find(JsonNode array, String field, String value) {
        for (JsonNode node : array) {
            if (node.path(field).asText().equals(value)) return node;
        }
        throw new AssertionError("Could not find " + field + "=" + value);
    }
}
