package com.stellana.mixing.service;

import com.stellana.mixing.api.ApiModels.CreateUserRequest;
import com.stellana.mixing.api.ApiModels.OperatorOptionView;
import com.stellana.mixing.api.ApiModels.UserView;
import com.stellana.mixing.domain.UserAccount;
import com.stellana.mixing.domain.Role;
import com.stellana.mixing.exception.BusinessRuleException;
import com.stellana.mixing.exception.NotFoundException;
import com.stellana.mixing.repository.UserAccountRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;

import static com.stellana.mixing.api.ApiMapper.user;

@Service
@RequiredArgsConstructor
public class UserService {
    private final UserAccountRepository userAccountRepository;
    private final PasswordEncoder passwordEncoder;
    private final CurrentUserService currentUserService;
    private final AuditService auditService;

    @Transactional(readOnly = true)
    public List<UserView> list() {
        return userAccountRepository.findAll().stream()
                .sorted(Comparator.comparing(UserAccount::getFullName))
                .map(com.stellana.mixing.api.ApiMapper::user).toList();
    }

    @Transactional(readOnly = true)
    public List<UserView> activeOfficers() {
        return userAccountRepository.findAllByRoleAndActiveTrue(Role.MIXING_OFFICER).stream()
                .sorted(Comparator.comparing(UserAccount::getFullName))
                .map(com.stellana.mixing.api.ApiMapper::user).toList();
    }

    @Transactional(readOnly = true)
    public List<OperatorOptionView> activeBlankingOperators() {
        return userAccountRepository.findAll().stream()
                .filter(UserAccount::isActive)
                .filter(value -> value.getRole() == Role.BLANKING_OPERATOR
                        || value.getRole() == Role.BLANKING_SUPERVISOR)
                .sorted(Comparator.comparing(UserAccount::getFullName, String.CASE_INSENSITIVE_ORDER))
                .map(value -> new OperatorOptionView(value.getEmployeeId(), value.getFullName()))
                .toList();
    }

    @Transactional
    public UserView create(CreateUserRequest request) {
        UserAccount actor = currentUserService.requireCurrentUser();
        if (userAccountRepository.existsByEmailIgnoreCase(request.email())) {
            throw new BusinessRuleException("A user with this email already exists.");
        }
        if (userAccountRepository.existsByEmployeeIdIgnoreCase(request.employeeId())) {
            throw new BusinessRuleException("A user with this employee ID already exists.");
        }
        UserAccount saved = userAccountRepository.save(UserAccount.builder()
                .fullName(request.fullName().trim())
                .employeeId(request.employeeId().trim().toUpperCase())
                .email(request.email().trim().toLowerCase())
                .passwordHash(passwordEncoder.encode(request.password()))
                .role(request.role())
                .active(true)
                .build());
        auditService.record(actor, "CREATE_USER", "UserAccount", saved.getId(), null,
                saved.getEmployeeId() + " / " + saved.getEmail() + " / " + saved.getRole(), null, null);
        return user(saved);
    }

    @Transactional
    public UserView setActive(Long id, boolean active) {
        UserAccount actor = currentUserService.requireCurrentUser();
        UserAccount value = userAccountRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("User not found."));
        if (value.getId().equals(actor.getId()) && !active) {
            throw new BusinessRuleException("You cannot deactivate your own account.");
        }
        boolean previous = value.isActive();
        value.setActive(active);
        UserAccount saved = userAccountRepository.save(value);
        auditService.record(actor, "CHANGE_USER_STATUS", "UserAccount", saved.getId(),
                String.valueOf(previous), String.valueOf(active), null, null);
        return user(saved);
    }
}
