export type Assignment = 'CONTROL' | 'TREATMENT';

/**
 * Determines the user's assignment group based on their User ID.
 * Uses a simple hash modulo 2 for deterministic assignment.
 * Checks for a local override first.
 * 
 * @param userId The UUID of the user.
 * @returns 'CONTROL' or 'TREATMENT'
 */
export function getAssignment(userId: string): Assignment {
    // Check for override first
    const override = localStorage.getItem('vn_assignment_override');
    if (override === 'CONTROL' || override === 'TREATMENT') {
        return override;
    }

    if (!userId) return 'CONTROL';

    // Simple hashing to ensure stable assignment for the same ID
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        hash = ((hash << 5) - hash) + userId.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
    }

    // Modulo 2 to split into two groups
    return Math.abs(hash) % 2 === 1 ? 'TREATMENT' : 'CONTROL';
}

/**
 * Sets an override for the assignment.
 * @param assignment 'CONTROL' | 'TREATMENT' | null (to clear)
 */
export function setAssignmentOverride(assignment: Assignment | null) {
    if (assignment) {
        localStorage.setItem('vn_assignment_override', assignment);
    } else {
        localStorage.removeItem('vn_assignment_override');
    }
}
