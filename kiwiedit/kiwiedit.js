// ======================== Gallery Tab Switching =====================
document.addEventListener('DOMContentLoaded', function() {
    // Initialize all tab groups on the page
    var tabGroups = document.querySelectorAll('.gallery-tabs');
    tabGroups.forEach(function(tabGroup) {
        var groupId = tabGroup.getAttribute('data-gallery');
        var tabs = tabGroup.querySelectorAll('.gallery-tab');
        var contents = document.querySelectorAll('.gallery-content[data-gallery="' + groupId + '"]');

        tabs.forEach(function(tab) {
            tab.addEventListener('click', function() {
                var target = this.getAttribute('data-target');

                // Deactivate all tabs in this group
                tabs.forEach(function(t) { t.classList.remove('active'); });
                // Activate clicked tab
                this.classList.add('active');

                // Hide all contents in this group
                contents.forEach(function(c) { c.classList.remove('active'); });
                // Show target content
                var targetContent = document.querySelector('.gallery-content[data-gallery="' + groupId + '"][data-id="' + target + '"]');
                if (targetContent) {
                    targetContent.classList.add('active');
                }
            });
        });
    });
});
