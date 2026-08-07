package com.stellana.mixing.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.stellana.mixing.domain.CompoundStockStatus;
import com.stellana.mixing.repository.ApprovedMaterialBatchRepository;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;
import java.math.BigDecimal;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class ConfirmedDownstreamWorkflowMockMvcTest {
    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;
    @Autowired ApprovedMaterialBatchRepository stockRepository;

    @Test
    @Order(1)
    void calculatedBlankingCartProductionAndReturnRemainTraceableThroughVarianceResolution() throws Exception {
        String admin = login("admin@stellana.local", "Admin123!");
        JsonNode stock = getJson("/api/blanking/compound-stock", admin);
        JsonNode available = null;
        for (JsonNode candidate : stock) {
            if (candidate.path("availableQuantityKg").asDouble() >= 60) {
                available = candidate;
                break;
            }
        }
        assertThat(available).as("a PASS stock batch with at least 60 kg").isNotNull();
        String suffix = UUID.randomUUID().toString().substring(0, 8).toUpperCase();

        JsonNode batch = postJson("/api/blanking/batches", admin, objectMapper.createObjectNode()
                .put("batchNumber", "BLK-CALC-" + suffix)
                .put("approvedMaterialBatchId", available.path("id").asLong())
                .put("materialConsumedKg", 60)
                .put("plannedProductionQuantity", 600)
                .put("itemCode", "UG 200×50")
                .put("millOperator", "Mill Operator Demo")
                .put("preformerOperator", "Preformer Operator Demo")
                .put("averageBlankWeightGrams", 100)
                .put("startImmediately", false));
        assertThat(batch.path("expectedBlankQuantity").decimalValue()).isEqualByComparingTo("600.000000");
        long batchId = batch.path("id").asLong();
        postJson("/api/blanking/batches/" + batchId + "/start", admin, objectMapper.createObjectNode());

        JsonNode completedBatch = postJson("/api/blanking/batches/" + batchId + "/complete", admin,
                objectMapper.createObjectNode()
                        .put("productionQuantity", 500)
                        .put("actualGoodBlankQuantity", 500)
                        .put("rejectedQuantity", 0)
                        .put("rejectedMaterialWeightKg", 0)
                        .put("measuredRemainingCompoundWeightKg", 10)
                        .put("supervisorConfirmation", false)
                        .put("notes", "60 kg issued; 500 × 100 g; 10 kg returned."));
        assertThat(completedBatch.path("actualUsedCompoundWeightKg").decimalValue())
                .isEqualByComparingTo("50.000");
        assertThat(completedBatch.path("remainingCompoundWeightKg").decimalValue())
                .isEqualByComparingTo("10.000");
        assertThat(completedBatch.path("productionVariance").asInt()).isEqualTo(-100);
        assertThat(completedBatch.path("unbalanced").asBoolean()).isFalse();

        JsonNode press = getJson("/api/moulding/presses", admin).get(0);
        JsonNode cart = postJson("/api/blanking/carts", admin, objectMapper.createObjectNode()
                .put("cartNumber", "CART-CALC-" + suffix)
                .put("blankingBatchId", batchId)
                .put("quantity", 100)
                .put("averageBlankWeightGrams", 100)
                .put("destinationPressId", press.path("id").asLong())
                .put("blankingNote", "Confirmed workflow test cart."));
        long cartId = cart.path("id").asLong();
        assertThat(cart.path("materialWeightKg").decimalValue()).isEqualByComparingTo("10.000");
        assertThat(cart.path("averageBlankWeightGrams").decimalValue()).isEqualByComparingTo("100.000");

        JsonNode held = postJson("/api/blanking/carts/" + cartId + "/hold", admin,
                objectMapper.createObjectNode().put("reason", "Quality identification check."));
        assertThat(held.path("status").asText()).isEqualTo("HELD");
        JsonNode released = postJson("/api/blanking/carts/" + cartId + "/release", admin,
                objectMapper.createObjectNode().put("note", "Identification confirmed."));
        assertThat(released.path("status").asText()).isEqualTo("READY_FOR_DISPATCH");
        JsonNode dispatched = postJson("/api/blanking/carts/" + cartId + "/dispatch", admin,
                objectMapper.createObjectNode().put("note", "Sent to Moulding."));
        assertThat(dispatched.path("status").asText()).isEqualTo("DISPATCHED");
        postExpectConflict("/api/blanking/carts/" + cartId + "/dispatch", admin,
                objectMapper.createObjectNode());

        JsonNode receipt = postJson("/api/moulding/carts/" + cartId + "/receive", admin,
                objectMapper.createObjectNode()
                        .put("pressId", press.path("id").asLong())
                        .put("supervisorOverride", false));
        assertThat(receipt.path("receiptNumber").asText()).startsWith("RCT-");
        postExpectConflict("/api/moulding/carts/" + cartId + "/receive", admin,
                objectMapper.createObjectNode()
                        .put("pressId", press.path("id").asLong())
                        .put("supervisorOverride", false));

        JsonNode record = postJson("/api/moulding/records/start", admin, objectMapper.createObjectNode()
                .put("pressId", press.path("id").asLong())
                .put("cartId", cartId));
        JsonNode production = postJson("/api/moulding/records/" + record.path("id").asLong() + "/complete",
                admin, objectMapper.createObjectNode()
                        .put("goodTyreQuantity", 75)
                        .put("rejectedTyreQuantity", 5)
                        .put("rejectedTyreWeightPerItemGrams", 100)
                        .put("rejectedBlankQuantity", 0)
                        .put("downtimeMinutes", 0)
                        .put("operatorNote", "Partial production with unused blanks."));
        assertThat(production.path("totalRejectedTyreWeightGrams").decimalValue())
                .isEqualByComparingTo("500.000");
        assertThat(production.path("remainingBlankQuantity").asInt()).isEqualTo(20);

        JsonNode blankReturn = postJson("/api/moulding/returns", admin, objectMapper.createObjectNode()
                .put("cartId", cartId)
                .put("pressId", press.path("id").asLong())
                .put("quantity", 20)
                .put("measuredReturnWeightKg", 2)
                .put("returnReason", "Production order completed.")
                .put("mouldingNote", "Unused blanks physically returned."));
        long returnId = blankReturn.path("id").asLong();
        assertThat(blankReturn.path("status").asText()).isEqualTo("RETURN_PREPARED");
        postJson("/api/moulding/returns/" + returnId + "/send", admin, objectMapper.createObjectNode());
        String blankingOperator = login("blanking.operator@stellana.local", "Blanking123!");
        JsonNode disputed = postJson("/api/blanking/returns/" + returnId + "/confirm", blankingOperator,
                objectMapper.createObjectNode()
                        .put("receivedQuantity", 19)
                        .put("receivedWeightKg", 1.9)
                        .put("varianceNote", "One piece was not present at physical receipt."));
        assertThat(disputed.path("status").asText()).isEqualTo("QUANTITY_DISPUTED");
        JsonNode afterDispute = getJson("/api/blanking/batches", blankingOperator);
        JsonNode disputedBatch = null;
        for (JsonNode candidate : afterDispute) {
            if (candidate.path("id").asLong() == batchId) {
                disputedBatch = candidate;
                break;
            }
        }
        assertThat(disputedBatch).isNotNull();
        assertThat(disputedBatch.path("availableGoodBlankQuantity").asInt()).isEqualTo(400);

        JsonNode confirmed = postJson("/api/blanking/returns/" + returnId + "/confirm", admin,
                objectMapper.createObjectNode()
                        .put("receivedQuantity", 19)
                        .put("receivedWeightKg", 1.9)
                        .put("varianceNote", "Administrator accepted the documented physical variance."));
        assertThat(confirmed.path("status").asText()).isEqualTo("CLOSED");
        assertThat(confirmed.path("quantityVariance").asInt()).isEqualTo(-1);
        assertThat(confirmed.path("weightVarianceKg").decimalValue()).isEqualByComparingTo("-0.100");
        postExpectConflict("/api/blanking/returns/" + returnId + "/confirm", admin,
                objectMapper.createObjectNode()
                        .put("receivedQuantity", 20)
                        .put("receivedWeightKg", 2));

        JsonNode ledger = getJson("/api/blanking/inventory-transactions", admin);
        assertThat(ledger.toString()).contains("COMPOUND_RESERVED", "BLANKS_PRODUCED",
                "CART_DISPATCHED", "CART_RECEIVED", "RETURN_CONFIRMED");
        JsonNode genealogy = getJson("/api/production-manager/genealogy/"
                + available.path("mixingBatchNumber").asText(), admin);
        assertThat(genealogy.path("blankingBatches").toString()).contains("BLK-CALC-" + suffix);
        assertThat(genealogy.path("returns").toString()).contains(confirmed.path("returnNumber").asText());
    }

    @Test
    @Order(2)
    void unbalancedCompletionRequiresAuthorizedConfirmationAndReason() throws Exception {
        String blanking = login("blanking.operator@stellana.local", "Blanking123!");
        JsonNode stock = getJson("/api/blanking/compound-stock", blanking);
        JsonNode available = null;
        for (JsonNode candidate : stock) {
            if (candidate.path("availableQuantityKg").asDouble() >= 1) {
                available = candidate;
                break;
            }
        }
        assertThat(available).as("a PASS stock batch with at least 1 kg").isNotNull();
        String suffix = UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        JsonNode batch = postJson("/api/blanking/batches", blanking, objectMapper.createObjectNode()
                .put("batchNumber", "BLK-VAR-" + suffix)
                .put("approvedMaterialBatchId", available.path("id").asLong())
                .put("materialConsumedKg", 1)
                .put("plannedProductionQuantity", 10)
                .put("itemCode", "VARIANCE-TEST")
                .put("millOperator", "Operator")
                .put("preformerOperator", "Operator")
                .put("averageBlankWeightGrams", 100)
                .put("startImmediately", true));
        postExpectConflict("/api/blanking/batches/" + batch.path("id").asLong() + "/complete", blanking,
                objectMapper.createObjectNode()
                        .put("productionQuantity", 5)
                        .put("actualGoodBlankQuantity", 5)
                        .put("rejectedQuantity", 0)
                        .put("rejectedMaterialWeightKg", 0)
                        .put("measuredRemainingCompoundWeightKg", 0.4)
                        .put("supervisorConfirmation", true)
                        .put("balanceConfirmationReason", "Operator cannot authorize own variance."));

        String admin = login("admin@stellana.local", "Admin123!");
        JsonNode authorizedCompletion = postJson(
                "/api/blanking/batches/" + batch.path("id").asLong() + "/complete", admin,
                objectMapper.createObjectNode()
                        .put("productionQuantity", 5)
                        .put("actualGoodBlankQuantity", 5)
                        .put("rejectedQuantity", 0)
                        .put("rejectedMaterialWeightKg", 0)
                        .put("measuredRemainingCompoundWeightKg", 0.4)
                        .put("supervisorConfirmation", true)
                        .put("balanceConfirmationReason", "Verified scale reading differs by 0.1 kg."));
        assertThat(authorizedCompletion.path("unbalanced").asBoolean()).isTrue();

        JsonNode corrected = patchJson(
                "/api/blanking/batches/" + batch.path("id").asLong() + "/correct", admin,
                objectMapper.createObjectNode()
                        .put("actualGoodBlankQuantity", 6)
                        .put("rejectedQuantity", 0)
                        .put("rejectedMaterialWeightKg", 0)
                        .put("measuredRemainingCompoundWeightKg", 0.4)
                        .put("reason", "Supervisor recount confirmed six good blanks."));
        assertThat(corrected.path("actualGoodBlankQuantity").asInt()).isEqualTo(6);
        assertThat(corrected.path("unbalanced").asBoolean()).isFalse();
        assertThat(getJson("/api/audit?limit=500", admin).toString())
                .contains("CORRECT_BLANKING_BATCH", "Supervisor recount confirmed six good blanks.");
    }

    @Test
    @Order(3)
    void concurrentCompoundReservationsCannotOverdrawStock() throws Exception {
        String admin = login("admin@stellana.local", "Admin123!");
        String blankingOperator = login("blanking.operator@stellana.local", "Blanking123!");
        var stock = stockRepository.findAllByOrderByApprovedAtDesc().get(0);
        stock.setReceivedQuantityKg(new BigDecimal("70.000"));
        stock.setAvailableQuantityKg(new BigDecimal("70.000"));
        stock.setReservedQuantityKg(BigDecimal.ZERO);
        stock.setConsumedQuantityKg(BigDecimal.ZERO);
        stock.setReturnedQuantityKg(BigDecimal.ZERO);
        stock.setStockStatus(CompoundStockStatus.AVAILABLE);
        stockRepository.save(stock);
        ObjectNode statusBody = objectMapper.createObjectNode()
                .put("status", "ON_HOLD")
                .put("reason", "Concurrency-test stock hold.");
        mockMvc.perform(patch("/api/blanking/compound-stock/" + stock.getId() + "/status")
                        .header("Authorization", "Bearer " + blankingOperator)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(statusBody)))
                .andExpect(status().isForbidden());
        assertThat(patchJson("/api/blanking/compound-stock/" + stock.getId() + "/status", admin, statusBody)
                .path("stockStatus").asText()).isEqualTo("ON_HOLD");
        postExpectConflict("/api/blanking/batches", admin, objectMapper.createObjectNode()
                .put("batchNumber", "BLK-HOLD-" + UUID.randomUUID().toString().substring(0, 8))
                .put("approvedMaterialBatchId", stock.getId())
                .put("materialConsumedKg", 1)
                .put("plannedProductionQuantity", 10)
                .put("averageBlankWeightGrams", 100));
        assertThat(patchJson("/api/blanking/compound-stock/" + stock.getId() + "/status", admin,
                objectMapper.createObjectNode()
                        .put("status", "AVAILABLE")
                        .put("reason", "Test hold released."))
                .path("stockStatus").asText()).isIn("AVAILABLE", "PARTIALLY_USED");

        String suffix = UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        CountDownLatch start = new CountDownLatch(1);
        var executor = Executors.newFixedThreadPool(2);
        try {
            CompletableFuture<Integer> first = CompletableFuture.supplyAsync(
                    () -> concurrentCreateStatus(
                            "BLK-CON-A-" + suffix, stock.getId(), admin, start), executor);
            CompletableFuture<Integer> second = CompletableFuture.supplyAsync(
                    () -> concurrentCreateStatus(
                            "BLK-CON-B-" + suffix, stock.getId(), admin, start), executor);
            start.countDown();
            List<Integer> statuses = List.of(first.join(), second.join()).stream().sorted().toList();
            assertThat(statuses).containsExactly(200, 409);
        } finally {
            executor.shutdownNow();
        }
        assertThat(stockRepository.findById(stock.getId()).orElseThrow().getAvailableQuantityKg())
                .isEqualByComparingTo("20.000");
    }

    @Test
    @Order(4)
    void onlyAdministratorCanCorrectACompoundReceiptWithoutOverdrawingAllocatedStock() throws Exception {
        String admin = login("admin@stellana.local", "Admin123!");
        String blankingOperator = login("blanking.operator@stellana.local", "Blanking123!");
        var stock = stockRepository.findAllByOrderByApprovedAtDesc().get(0);
        BigDecimal previousReceived = stock.getReceivedQuantityKg();
        BigDecimal previousAvailable = stock.getAvailableQuantityKg();
        BigDecimal correctedReceived = previousReceived.add(new BigDecimal("5.000"));
        ObjectNode correction = objectMapper.createObjectNode()
                .put("receivedQuantityKg", correctedReceived)
                .put("reason", "Administrator confirmed the physical scale receipt.");

        mockMvc.perform(patch("/api/blanking/compound-stock/" + stock.getId() + "/receipt")
                        .header("Authorization", "Bearer " + blankingOperator)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(correction)))
                .andExpect(status().isForbidden());

        JsonNode updated = patchJson(
                "/api/blanking/compound-stock/" + stock.getId() + "/receipt", admin, correction);
        assertThat(updated.path("receivedQuantityKg").decimalValue())
                .isEqualByComparingTo(correctedReceived);
        assertThat(updated.path("availableQuantityKg").decimalValue())
                .isEqualByComparingTo(previousAvailable.add(new BigDecimal("5.000")));
        assertThat(updated.path("receivingOperator").path("role").asText()).isEqualTo("SYSTEM_ADMIN");

        BigDecimal allocated = correctedReceived.subtract(updated.path("availableQuantityKg").decimalValue());
        mockMvc.perform(patch("/api/blanking/compound-stock/" + stock.getId() + "/receipt")
                        .header("Authorization", "Bearer " + admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(objectMapper.createObjectNode()
                                .put("receivedQuantityKg", allocated.subtract(new BigDecimal("0.001")))
                                .put("reason", "Invalid reduction below allocated stock."))))
                .andExpect(status().isConflict());

        assertThat(getJson("/api/blanking/inventory-transactions", admin).toString())
                .contains("INVENTORY_CORRECTION", "Administrator confirmed the physical scale receipt.");
        assertThat(getJson("/api/audit?limit=200", admin).toString())
                .contains("UPDATE_COMPOUND_RECEIPT", "Administrator confirmed the physical scale receipt.");
    }

    private String login(String email, String password) throws Exception {
        return postJson("/api/auth/login", null,
                objectMapper.createObjectNode().put("email", email).put("password", password))
                .path("token").asText();
    }

    private JsonNode getJson(String path, String token) throws Exception {
        String content = mockMvc.perform(get(path).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(content);
    }

    private JsonNode postJson(String path, String token, JsonNode body) throws Exception {
        var request = post(path).contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body));
        if (token != null) request.header("Authorization", "Bearer " + token);
        String content = mockMvc.perform(request).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(content);
    }

    private JsonNode patchJson(String path, String token, JsonNode body) throws Exception {
        String content = mockMvc.perform(patch(path)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(content);
    }

    private int concurrentCreateStatus(
            String batchNumber,
            Long stockId,
            String token,
            CountDownLatch start) {
        try {
            start.await();
            ObjectNode body = objectMapper.createObjectNode()
                    .put("batchNumber", batchNumber)
                    .put("approvedMaterialBatchId", stockId)
                    .put("materialConsumedKg", 50)
                    .put("plannedProductionQuantity", 500)
                    .put("itemCode", "CONCURRENCY-TEST")
                    .put("millOperator", "Test")
                    .put("preformerOperator", "Test")
                    .put("averageBlankWeightGrams", 100)
                    .put("startImmediately", false);
            return mockMvc.perform(post("/api/blanking/batches")
                            .header("Authorization", "Bearer " + token)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(body)))
                    .andReturn().getResponse().getStatus();
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private void postExpectConflict(String path, String token, ObjectNode body) throws Exception {
        mockMvc.perform(post(path)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isConflict());
    }
}
