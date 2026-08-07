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
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class MixingScheduleMockMvcTest {
    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;

    @Test
    void plansDetectsConflictsAndProtectsEarlyStarts() throws Exception {
        String managerToken = login("manager@stellana.local", "Manager123!");
        String officerToken = login("officer@stellana.local", "Mixing123!");
        JsonNode revision = getJson("/api/recipes/active", managerToken).get(0);
        JsonNode officer = getJson("/api/users/officers", managerToken).get(0);
        LocalDateTime start = LocalDateTime.now().plusDays(2).truncatedTo(ChronoUnit.MINUTES);
        LocalDateTime target = start.plusHours(2);
        String suffix = UUID.randomUUID().toString().substring(0, 8).toUpperCase();

        ObjectNode firstRequest = batchRequest("SCH-A-" + suffix, revision.get("id").asLong(), officer.get("id").asLong())
                .put("plannedStartTime", start.toString())
                .put("targetCompletionTime", target.toString())
                .put("productionPriority", "HIGH")
                .put("scheduleNotes", "MockMvc planned run")
                .put("confirmScheduleConflicts", false);
        JsonNode first = postJson("/api/batches", managerToken, firstRequest);
        assertThat(first.get("scheduleTimingStatus").asText()).isEqualTo("SCHEDULED");
        assertThat(first.get("plannedStartTime").asText()).startsWith(start.toString());

        JsonNode second = postJson("/api/batches", managerToken,
                batchRequest("SCH-B-" + suffix, revision.get("id").asLong(), officer.get("id").asLong()));
        ObjectNode schedule = scheduleRequest(start, target, officer.get("id").asLong(), false, null);
        mockMvc.perform(put("/api/batches/{id}/schedule", second.get("id").asLong())
                        .header("Authorization", "Bearer " + managerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(schedule)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message", containsString("Schedule conflict")));

        schedule.put("confirmScheduleConflicts", true)
                .put("scheduleConflictReason", "Authorized planning overlap for workflow test");
        JsonNode scheduledSecond = putJson("/api/batches/" + second.get("id").asLong() + "/schedule", managerToken, schedule);
        assertThat(scheduledSecond.get("scheduleTimingStatus").asText()).isEqualTo("SCHEDULED");

        postJson("/api/batches/" + first.get("id").asLong() + "/transition", managerToken,
                objectMapper.createObjectNode().put("status", "READY_FOR_STAGE_1").put("reason", "Materials ready for test"));
        ObjectNode normalStart = objectMapper.createObjectNode()
                .put("batchId", first.get("id").asLong()).put("stageNumber", 1)
                .put("machine", "Schedule Test Mixer").put("managerOverride", false)
                .put("earlyStartOverride", false);
        mockMvc.perform(post("/api/stages/start")
                        .header("Authorization", "Bearer " + officerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(normalStart)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message", containsString("scheduled to start")));

        normalStart.put("earlyStartOverride", true)
                .put("earlyStartReason", "Manager-authorized machine availability window");
        JsonNode stage = postJson("/api/stages/start", managerToken, normalStart);
        assertThat(stage.get("startTime").isNull()).isFalse();

        JsonNode dashboard = getJson("/api/dashboard", managerToken);
        assertThat(dashboard.get("scheduleBoard"))
                .anyMatch(node -> ("SCH-A-" + suffix).equals(node.get("batchNumber").asText()));
        JsonNode audit = getJson("/api/audit", managerToken);
        assertThat(audit).anyMatch(node -> "OVERRIDE_EARLY_BATCH_START".equals(node.get("action").asText()));
    }

    private ObjectNode batchRequest(String batchNumber, long revisionId, long officerId) {
        return objectMapper.createObjectNode()
                .put("batchNumber", batchNumber)
                .put("recipeRevisionId", revisionId)
                .put("plannedQuantityKg", 160.0)
                .put("machine", "Schedule Test Mixer")
                .put("assignedOfficerId", officerId);
    }

    private ObjectNode scheduleRequest(LocalDateTime start, LocalDateTime target, long officerId,
                                       boolean confirmed, String reason) {
        ObjectNode request = objectMapper.createObjectNode()
                .put("plannedStartTime", start.toString())
                .put("targetCompletionTime", target.toString())
                .put("assignedOfficerId", officerId)
                .put("machine", "Schedule Test Mixer")
                .put("productionPriority", "NORMAL")
                .put("scheduleNotes", "Conflict test")
                .put("confirmScheduleConflicts", confirmed);
        if (reason != null) request.put("scheduleConflictReason", reason);
        return request;
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
        var request = post(path).contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(body));
        if (token != null) request.header("Authorization", "Bearer " + token);
        String response = mockMvc.perform(request).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response);
    }

    private JsonNode putJson(String path, String token, JsonNode body) throws Exception {
        String response = mockMvc.perform(put(path).header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response);
    }
}
