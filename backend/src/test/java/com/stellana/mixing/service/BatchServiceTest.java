package com.stellana.mixing.service;

import com.stellana.mixing.api.ApiModels.BatchTransitionRequest;
import com.stellana.mixing.api.ApiModels.CreateBatchRequest;
import com.stellana.mixing.domain.*;
import com.stellana.mixing.exception.BusinessRuleException;
import com.stellana.mixing.repository.BatchStatusHistoryRepository;
import com.stellana.mixing.repository.ProductionBatchRepository;
import com.stellana.mixing.repository.RecipeRevisionRepository;
import com.stellana.mixing.repository.UserAccountRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BatchServiceTest {
    @Mock ProductionBatchRepository batchRepository;
    @Mock BatchStatusHistoryRepository historyRepository;
    @Mock RecipeRevisionRepository revisionRepository;
    @Mock UserAccountRepository userAccountRepository;
    @Mock CurrentUserService currentUserService;
    @Mock AuditService auditService;
    @Mock NotificationService notificationService;
    @Mock RealtimeEventService realtimeEventService;

    @InjectMocks BatchService batchService;

    private UserAccount manager;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(batchService, "mixerCapacityKg", new BigDecimal("240"));
        manager = UserAccount.builder()
                .fullName("Manager")
                .email("manager@test.local")
                .passwordHash("encoded")
                .role(Role.MANAGER)
                .active(true)
                .build();
        manager.setId(1L);
    }

    @Test
    void rejectsAnInvalidStatusTransition() {
        ProductionBatch batch = ProductionBatch.builder()
                .batchNumber("TEST-001")
                .status(BatchStatus.PLANNED)
                .assignedOfficer(manager)
                .build();
        batch.setId(10L);
        when(currentUserService.requireCurrentUser()).thenReturn(manager);
        when(batchRepository.findById(10L)).thenReturn(Optional.of(batch));

        assertThatThrownBy(() -> batchService.transition(
                10L, new BatchTransitionRequest(BatchStatus.LAB_PASSED, null, null)))
                .isInstanceOf(BusinessRuleException.class)
                .hasMessageContaining("Invalid batch transition");
    }

    @Test
    void doesNotApplyUnconfirmedFillFactorAndRejectsOnlyOverCapacityLoad() {
        when(currentUserService.requireCurrentUser()).thenReturn(manager);
        when(batchRepository.existsByBatchNumberIgnoreCase("TEST-OVER")).thenReturn(false);

        CreateBatchRequest request = new CreateBatchRequest(
                "TEST-OVER", 1L, new BigDecimal("240.001"), "Mixer A", 2L, null,
                null, null, null, null, false, null);

        assertThatThrownBy(() -> batchService.create(request))
                .isInstanceOf(BusinessRuleException.class)
                .hasMessageContaining("240")
                .hasMessageContaining("fill factor is not used");
    }
}
